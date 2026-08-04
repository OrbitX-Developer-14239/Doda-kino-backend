import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { CONFIG } from "../config/index.js";
import { AdminModel } from "../models/admin.model.js";
import { AuthSessionModel } from "../models/auth-session.model.js";
import { BotService } from "./bot.service.js";

const AUTH_SESSION_TTL_MS = 15 * 60 * 1000;

/**
 * Socket xonasi uchun sessiya tokenini yaratadi va serverda ro'yxatga oladi.
 * Ro'yxatdan o'tmagan tokenga socket orqali qo'shilib bo'lmaydi.
 */
const createAuthSession = async (purpose, adminId = null) => {
    const token = crypto.randomUUID();
    await AuthSessionModel.create({
        token,
        purpose,
        adminId,
        expiresAt: new Date(Date.now() + AUTH_SESSION_TTL_MS)
    });
    return token;
};

const JWT_SECRET = CONFIG.JWT_SECRET;
const JWT_REFRESH_SECRET = CONFIG.JWT_REFRESH_SECRET;
const BCRYPT_ROUNDS = 12;

const PUBLIC_ADMIN_FIELDS =
    "username role isVerified telegramId telegramUsername firstName lastName phoneNumber createdAt updatedAt";

const issueTokens = (admin) => ({
    accessToken: jwt.sign({ id: admin._id, role: admin.role }, JWT_SECRET, {
        expiresIn: CONFIG.ACCESS_TOKEN_TTL
    }),
    refreshToken: jwt.sign({ id: admin._id, role: admin.role }, JWT_REFRESH_SECRET, {
        expiresIn: CONFIG.REFRESH_TOKEN_TTL
    })
});

const normalizeTelegramId = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};

const normalizePhoneNumber = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const trimmed = String(value).trim();
    return trimmed || null;
};

const normalizeContactData = (contactData = {}) => ({
    telegramId: normalizeTelegramId(contactData.telegramId ?? contactData.user_id ?? contactData.telegram_id),
    phoneNumber: normalizePhoneNumber(contactData.phoneNumber ?? contactData.phone_number ?? null),
    firstName: contactData.firstName ?? contactData.first_name ?? null,
    lastName: contactData.lastName ?? contactData.last_name ?? null,
    telegramUsername: contactData.telegramUsername ?? contactData.username ?? contactData.telegram_username ?? null,
    authSessionToken: contactData.authSessionToken ?? null,
});

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

const buildAdminPanelAuthUrl = (token) => {
    const baseUrl = CONFIG.ADMIN_PANEL_URL;
    return `${baseUrl.replace(/\/$/, "")}/admin/telegram-auth?token=${encodeURIComponent(token)}`;
};

export const AdminService = {
    async initSuperAdmin() {
        const superAdmin = await AdminModel.findOne({ role: "superadmin" }).select("_id").lean();
        if (superAdmin) return;

        // Parol env dan olinadi; berilmasa tasodifiy yaratilib bir marta konsolga chiqadi.
        // Ilgari bu yerda hamma biladigan "superadmin123" qattiq yozilgan edi.
        const generated = !CONFIG.SUPERADMIN_PASSWORD;
        const password = CONFIG.SUPERADMIN_PASSWORD || crypto.randomBytes(12).toString("base64url");
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        await AdminModel.create({
            username: CONFIG.SUPERADMIN_USERNAME,
            password: hashedPassword,
            role: "superadmin",
            isVerified: true
        });

        if (generated) {
            console.log(
                "\n" + "=".repeat(72) +
                `\nDastlabki SUPERADMIN yaratildi!\n  Login: ${CONFIG.SUPERADMIN_USERNAME}\n  Parol: ${password}\n` +
                "Ushbu parolni saqlab qo'ying — u boshqa ko'rsatilmaydi.\n" +
                "=".repeat(72) + "\n"
            );
        } else {
            console.log(`Dastlabki SUPERADMIN yaratildi (parol .env dan olindi) -> Login: ${CONFIG.SUPERADMIN_USERNAME}`);
        }
    },

    async login(body) {
        const { username, password } = body;
        const admin = await AdminModel.findOne({ username });
        if (!admin) throw Object.assign(new Error("Login yoki parol xato"), { status: 401 });

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) throw Object.assign(new Error("Login yoki parol xato"), { status: 401 });

        if (!admin.isVerified) {
            const bot = await BotService.getCachedBot();
            if (!bot) throw Object.assign(new Error("Xatolik! Baza sozlamalariga bot token va username aniqlanmagan. Iltimos Bot ma'lumotlarini saqlang!"), { status: 400 });

            const verifyLink = `https://t.me/${bot.username}?start=verify_${admin.verifyToken}`;
            return {
                verifyRequired: true,
                message: "Bu akkaunt qabul qilinishni (verify) kutmoqda. Qabul qilinishi uchun telegramda botga o'ting!",
                verifyLink
            };
        }

        const { accessToken, refreshToken } = issueTokens(admin);
        admin.refreshToken = refreshToken;
        await admin.save();

        return { accessToken, refreshToken, user: { id: admin._id, username: admin.username, role: admin.role } };
    },

    async getAdminProfile(adminId) {
        if (!adminId) throw Object.assign(new Error("Admin ID kerak"), { status: 400 });
        const admin = await AdminModel.findById(adminId).select(
            "username role isVerified telegramId telegramUsername firstName lastName phoneNumber createdAt"
        ).lean();
        if (!admin) throw Object.assign(new Error("Admin topilmadi"), { status: 404 });
        return admin;
    },

    async createAdmin(body) {
        const exist = await AdminModel.findOne({ username: body.username });
        if (exist) throw Object.assign(new Error("Bu username band qilingan, boshqasini tanlang!"), { status: 409 });

        const hashedPassword = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
        const verifyToken = crypto.randomUUID();

        const admin = await AdminModel.create({
            username: body.username,
            password: hashedPassword,
            role: "admin",
            isVerified: false,
            verifyToken: verifyToken
        });

        const bot = await BotService.getCachedBot();
        if (!bot) throw Object.assign(new Error("Serverda bot ulanmagan! Avval Bot Token va Username qoshing /api/bot/saveToken"), { status: 400 });

        const verifyLink = `https://t.me/${bot.username}?start=verify_${verifyToken}`;

        return {
            message: "Yangi admin yaratildi. Aktivlashtirish uchun ushbu 1 martalik havolani Adminga Telegram orqali yuboring!",
            verifyLink,
            admin: { username: admin.username }
        };
    },

    // ─── TELEGRAM ULASH (login dan alohida) ─────────────────────────────────────

    async requestTelegramLink(adminId) {
        if (!adminId) throw Object.assign(new Error("Admin ID kerak"), { status: 400 });

        const admin = await AdminModel.findById(adminId);
        if (!admin) throw Object.assign(new Error("Admin topilmadi"), { status: 404 });
        if (!admin.isVerified) throw Object.assign(new Error("Admin tasdiqlanmagan"), { status: 403 });

        const bot = await BotService.getCachedBot();
        const botUsername = bot?.username || process.env.BOT_USERNAME || "";

        const linkToken = crypto.randomUUID();
        const authSessionToken = await createAuthSession("link", admin._id);
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        admin.telegramLinkTokenHash = hashToken(linkToken);
        admin.telegramLinkExpiresAt = expiresAt;
        admin.telegramAuthSessionToken = authSessionToken;
        await admin.save();

        const linkUrl = botUsername ? `https://t.me/${botUsername}?start=admin_link_${linkToken}` : null;

        return {
            success: true,
            linkUrl,
            authSessionToken,
            expiresInMinutes: 15,
            expiresAt,
        };
    },

    async linkAdminByContact(contactData = {}) {
        const { linkToken, telegramId, telegramUsername, phoneNumber, firstName, lastName } = contactData;

        if (!linkToken) throw Object.assign(new Error("Link token kerak"), { status: 400 });

        const admin = await AdminModel.findOne({
            telegramLinkTokenHash: hashToken(linkToken),
            telegramLinkExpiresAt: { $gt: new Date() },
        });

        if (!admin) {
            throw Object.assign(new Error("Havola muddati tugagan yoki yaroqsiz"), { status: 401 });
        }

        const authSessionToken = admin.telegramAuthSessionToken;

        // Boshqa adminda ulangan bo'lsa — xato
        if (telegramId) {
            const alreadyLinked = await AdminModel.findOne({
                telegramId: telegramId,
                _id: { $ne: admin._id },
            });

            if (alreadyLinked) {
                const { getIo } = await import("../socket.js");
                const io = getIo();
                if (io && authSessionToken) {
                    io.to(`auth_${authSessionToken}`).emit("link_error", {
                        message: "Bu Telegram hisob boshqa admin hisobiga ulangan!"
                    });
                }
                return { success: false, message: "Bu Telegram hisob boshqa admin hisobiga ulangan!" };
            }
        }

        // Ulash
        admin.telegramId = telegramId ?? admin.telegramId;
        admin.telegramUsername = telegramUsername ?? admin.telegramUsername;
        admin.phoneNumber = phoneNumber ?? admin.phoneNumber;
        admin.firstName = firstName ?? admin.firstName;
        admin.lastName = lastName ?? admin.lastName;
        admin.telegramLinkTokenHash = null;
        admin.telegramLinkExpiresAt = null;
        admin.telegramAuthSessionToken = null;
        await admin.save();

        // Socket orqali muvaffaqiyat xabari
        const { getIo } = await import("../socket.js");
        const io = getIo();
        if (io && authSessionToken) {
            io.to(`auth_${authSessionToken}`).emit("link_success", {
                success: true,
                data: { telegramUsername: telegramUsername || null, telegramId: telegramId || null }
            });
        }

        return { success: true, message: "Telegram hisob muvaffaqiyatli ulandi" };
    },

    async createTelegramLoginLinkForContact(contactData = {}) {
        const normalizedContactData = normalizeContactData(contactData);
        if (!normalizedContactData.phoneNumber) {
            throw Object.assign(new Error("Telefon raqami yuborilmagan"), { status: 400 });
        }

        const cleanPhone = normalizedContactData.phoneNumber.replace(/\D/g, "");
        const formattedPhoneWithPlus = `+${cleanPhone}`;

        const admin = await AdminModel.findOne({
            phoneNumber: { $in: [cleanPhone, formattedPhoneWithPlus] },
            isVerified: true,
        }).sort({ createdAt: 1 });

        if (!admin) {
            const { getIo } = await import("../socket.js");
            const io = getIo();
            if (io && normalizedContactData.authSessionToken) {
                 io.to(`auth_${normalizedContactData.authSessionToken}`).emit("auth_error", { message: "Telefon raqamingiz tizimda topilmadi!" });
            }
            return {
                success: false,
                message: "Telefon raqamingiz tizimda topilmadi!"
            };
        }

        if (normalizedContactData.authSessionToken) {
            const { accessToken, refreshToken } = issueTokens(admin);

            admin.refreshToken = refreshToken;
            admin.telegramId = normalizedContactData.telegramId ?? admin.telegramId;
            admin.telegramUsername = normalizedContactData.telegramUsername ?? admin.telegramUsername;
            admin.firstName = normalizedContactData.firstName ?? admin.firstName;
            admin.lastName = normalizedContactData.lastName ?? admin.lastName;
            admin.phoneNumber = normalizedContactData.phoneNumber ?? admin.phoneNumber;
            await admin.save();

            const { getIo } = await import("../socket.js");
            const io = getIo();
            if (io) {
                // refreshToken socket orqali YUBORILMAYDI — u faqat httpOnly cookie da yashaydi.
                io.to(`auth_${normalizedContactData.authSessionToken}`).emit("auth_success", {
                    success: true,
                    data: {
                        accessToken,
                        user: { id: admin._id, username: admin.username, role: admin.role }
                    }
                });
            }

            return {
                success: true,
                message: "Muvaffaqiyatli uladingiz, brauzerga qaytishingiz mumkin",
                viaSocket: true
            }
        }

        const loginToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        admin.telegramLoginTokenHash = hashToken(loginToken);
        admin.telegramLoginExpiresAt = expiresAt;
        admin.telegramId = normalizedContactData.telegramId ?? admin.telegramId;
        admin.telegramUsername = normalizedContactData.telegramUsername ?? admin.telegramUsername;
        admin.firstName = normalizedContactData.firstName ?? admin.firstName;
        admin.lastName = normalizedContactData.lastName ?? admin.lastName;
        admin.phoneNumber = normalizedContactData.phoneNumber ?? admin.phoneNumber;
        await admin.save();

        const bot = await BotService.getCachedBot();
        const botUsername = bot?.username || process.env.BOT_USERNAME || "";
        const loginLink = botUsername ? `https://t.me/${botUsername}?start=admin_login_${loginToken}` : null;

        return {
            success: true,
            message: "Muvaffaqiyatli! Admin panelga o'tish uchun quyidagi tugmani bosing (Token 15 daqiqa davomida amal qiladi).",
            loginLink,
            panelAuthUrl: buildAdminPanelAuthUrl(loginToken),
            expiresInMinutes: 15,
            expiresAt,
            user: { id: admin._id, username: admin.username, role: admin.role }
        };
    },

    async requestTelegramLogin(adminId) {
        const bot = await BotService.getCachedBot();
        const botUsername = bot?.username || process.env.BOT_USERNAME || "";
        const startLink = botUsername ? `https://t.me/${botUsername}?start=login` : null;

        if (!adminId) {
            const authSessionToken = await createAuthSession("login");
            const loginLink = botUsername ? `https://t.me/${botUsername}?start=admin_login_${authSessionToken}` : null;

            return {
                success: true,
                message: "Telegram botiga kirish uchun quyidagi tugmani bosing.",
                loginLink: loginLink,
                telegramOpenUrl: loginLink,
                botStartUrl: loginLink,
                authSessionToken: authSessionToken,
                panelAuthUrl: null,
                expiresInMinutes: 15,
            };
        }

        const admin = await AdminModel.findById(adminId);
        if (!admin) throw Object.assign(new Error("Admin topilmadi"), { status: 404 });
        if (!admin.isVerified) throw Object.assign(new Error("Bu admin hali tasdiqlanmagan"), { status: 403 });

        const loginToken = crypto.randomUUID();
        const authSessionToken = await createAuthSession("login", admin._id); // Socket room uchun
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        admin.telegramLoginTokenHash = hashToken(loginToken);
        admin.telegramLoginExpiresAt = expiresAt;
        admin.telegramAuthSessionToken = authSessionToken; // Saqlash
        await admin.save();

        const loginLink = botUsername ? `https://t.me/${botUsername}?start=admin_login_${loginToken}` : null;

        return {
            success: true,
            message: "Telegram orqali kirish uchun tayyorlandi.",
            loginLink,
            telegramOpenUrl: loginLink,
            botStartUrl: loginLink,
            panelAuthUrl: buildAdminPanelAuthUrl(loginToken),
            authSessionToken, // Frontend socket uchun
            expiresInMinutes: 15,
            expiresAt,
            user: { id: admin._id, username: admin.username, role: admin.role }
        };
    },

    async authenticateAdminByTelegramToken(token) {
        if (!token) throw Object.assign(new Error("Telegram login token mavjud emas"), { status: 400 });

        const admin = await AdminModel.findOne({ telegramLoginTokenHash: hashToken(token) });
        if (!admin || !admin.telegramLoginExpiresAt || new Date(admin.telegramLoginExpiresAt) < new Date()) {
            throw Object.assign(new Error("Telegram login linki muddati tugagan yoki yaroqsiz"), { status: 401 });
        }

        const authSessionToken = admin.telegramAuthSessionToken;

        admin.telegramLoginTokenHash = null;
        admin.telegramLoginExpiresAt = null;
        admin.telegramAuthSessionToken = null;

        const { accessToken, refreshToken } = issueTokens(admin);

        admin.refreshToken = refreshToken;
        await admin.save();

        // Settings sahifasidagi Telegram ulash socketini xabar berish
        if (authSessionToken) {
            const { getIo } = await import("../socket.js");
            const io = getIo();
            if (io) {
                io.to(`auth_${authSessionToken}`).emit("auth_success", {
                    success: true,
                    data: {
                        accessToken,
                        user: { id: admin._id, username: admin.username, role: admin.role }
                    }
                });
            }
        }

        return {
            message: "Telegram orqali kirish muvaffaqiyatli yakunlandi.",
            accessToken,
            refreshToken,
            user: { id: admin._id, username: admin.username, role: admin.role }
        };
    },

    async verifyAdmin(token, contactData = {}) {
        if (!token) throw Object.assign(new Error("Verify token mavjud emas!"), { status: 400 });

        const admin = await AdminModel.findOne({ verifyToken: token });
        if (!admin) throw Object.assign(new Error("Ushbu havola yaroqsiz yoki allaqachon ishlatib bo'lingan!"), { status: 400 });

        admin.isVerified = true;
        admin.verifyToken = null;

        const normalizedContactData = normalizeContactData(contactData);
        admin.telegramId = normalizedContactData.telegramId;
        admin.phoneNumber = normalizedContactData.phoneNumber;
        admin.firstName = normalizedContactData.firstName;
        admin.lastName = normalizedContactData.lastName;
        admin.telegramUsername = normalizedContactData.telegramUsername;

        const { accessToken, refreshToken } = issueTokens(admin);

        const loginToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

        admin.telegramLoginTokenHash = hashToken(loginToken);
        admin.telegramLoginExpiresAt = expiresAt;

        admin.refreshToken = refreshToken;
        await admin.save();

        return {
            message: "Tabriklaymiz! Akauntingiz tasdiqlandi. Admin panelga o'tish uchun quyidagi tugmani bosing.",
            accessToken,
            refreshToken,
            panelAuthUrl: buildAdminPanelAuthUrl(loginToken),
            user: { id: admin._id, username: admin.username, role: admin.role }
        };
    },

    async refresh(token) {
        if (!token) throw Object.assign(new Error("Refresh token mavjud emas"), { status: 401 });
        try {
            const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
            const admin = await AdminModel.findById(decoded.id);

            if (!admin || admin.refreshToken !== token) {
                throw new Error();
            }

            const { accessToken: newAccessToken } = issueTokens(admin);
            return { accessToken: newAccessToken };
        } catch (error) {
            throw Object.assign(new Error("Refresh token yaroqsiz yoki eskirgan"), { status: 403 });
        }
    },

    async logout(id) {
        const admin = await AdminModel.findById(id);
        if (admin) {
            admin.refreshToken = null;
            await admin.save();
        }
        return { message: "Tizimdan to'liq chiqildi" };
    },

    async updateAdmin(targetId, myUser, body = {}) {
        const targetAdmin = await AdminModel.findById(targetId);
        if (!targetAdmin) throw Object.assign(new Error("Tahrirlanadigan admin topilmadi"), { status: 404 });

        if (myUser.role !== "superadmin" && targetAdmin._id.toString() !== myUser._id.toString()) {
            throw Object.assign(new Error("Siz faqat shaxsiy profilingizni o'zgartira olasiz!"), { status: 403 });
        }

        if (body.role && myUser.role !== "superadmin") {
            throw Object.assign(new Error("Faqat superadmin role o'zgartira oladi!"), { status: 403 });
        }

        if (body.isVerified !== undefined && myUser.role !== "superadmin") {
            throw Object.assign(new Error("Faqat superadmin tasdiq holatini o'zgartira oladi!"), { status: 403 });
        }

        if (body.username) {
            const check = await AdminModel.findOne({ username: body.username, _id: { $ne: targetId } });
            if (check) throw Object.assign(new Error("Bu username boshqasida bor!"), { status: 409 });
            targetAdmin.username = body.username;
        }

        if (body.password) {
            targetAdmin.password = await bcrypt.hash(body.password, BCRYPT_ROUNDS);
        }

        if (body.firstName !== undefined) {
            targetAdmin.firstName = body.firstName || null;
        }

        if (body.lastName !== undefined) {
            targetAdmin.lastName = body.lastName || null;
        }

        if (body.telegramUsername !== undefined) {
            targetAdmin.telegramUsername = body.telegramUsername || null;
        }

        if (body.phoneNumber !== undefined) {
            targetAdmin.phoneNumber = body.phoneNumber || null;
        }

        if (body.telegramId !== undefined) {
            targetAdmin.telegramId = body.telegramId ? Number(body.telegramId) : null;
        }

        if (body.role) {
            targetAdmin.role = body.role;
        }

        if (body.isVerified !== undefined) {
            targetAdmin.isVerified = body.isVerified;
        }

        await targetAdmin.save();
        return {
            message: "Muvaffaqiyatli o'zgartirildi!",
            admin: {
                username: targetAdmin.username,
                role: targetAdmin.role,
                firstName: targetAdmin.firstName,
                lastName: targetAdmin.lastName,
                telegramUsername: targetAdmin.telegramUsername,
                phoneNumber: targetAdmin.phoneNumber,
                telegramId: targetAdmin.telegramId,
                isVerified: targetAdmin.isVerified,
            }
        };
    },

    async deleteAdmin(targetId) {
        const targetAdmin = await AdminModel.findById(targetId);
        if (!targetAdmin) throw Object.assign(new Error("Admin topilmadi"), { status: 404 });

        if (targetAdmin.role === "superadmin") {
            throw Object.assign(new Error("Xavfsizlik ogohlantiruvi: Superadminni o'chirish taqiqlangan! Uni faqat tahrirlash mumkin."), { status: 403 });
        }

        await targetAdmin.deleteOne();
        return { message: "Admin tizimdan umrbod o'chirib yuborildi." };
    },

    async getAllAdmins() {
        const admins = await AdminModel.find().select(PUBLIC_ADMIN_FIELDS).lean();
        return admins;
    }
}
