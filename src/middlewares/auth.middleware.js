import jwt from "jsonwebtoken";
import { CONFIG } from "../config/index.js";
import { AdminModel } from "../models/admin.model.js";

const unauthorized = (res, message) =>
    res.status(401).json({ success: false, message });

/**
 * Access token ni tekshiradi va req.admin ni to'ldiradi.
 * Faqat kerakli maydonlar o'qiladi (lean) — har so'rovda to'liq hujjat hydratsiya qilinmaydi.
 */
export const authMiddleware = (roles = []) => {
    return async (req, res, next) => {
        const header = req.headers.authorization || "";
        const [scheme, token] = header.split(" ");

        if (!token || scheme?.toLowerCase() !== "bearer") {
            return unauthorized(res, "Avtorizatsiya tokeni topilmadi!");
        }

        let decoded;
        try {
            decoded = jwt.verify(token, CONFIG.JWT_SECRET);
        } catch {
            return unauthorized(res, "Berilgan token yaroqsiz yoki muddati o'tgan");
        }

        try {
            const admin = await AdminModel.findById(decoded.id)
                .select("username role isVerified")
                .lean();

            if (!admin) {
                return unauthorized(res, "Bunday foydalanuvchi tizimda yo'q");
            }

            if (!admin.isVerified) {
                return res.status(403).json({
                    success: false,
                    message: "Profilingiz hali Telegram orqali tasdiqlanmagan!"
                });
            }

            if (roles.length && !roles.includes(admin.role)) {
                return res.status(403).json({
                    success: false,
                    message: "Sizda ushbu amalni bajarish uchun huquq / ruxsat yo'q"
                });
            }

            req.admin = admin;
            next();
        } catch (error) {
            next(error);
        }
    }
}
