import { UserModel } from "../models/user.model.js";
import { ChannelService } from "./channel.service.js";
import { ChannelEventModel } from "../models/channel-event.model.js";
import { logger } from "../utils/logger.js";

// Faqat shu maydonlarni yozishga ruxsat (mass assignment ga qarshi)
const WRITABLE_FIELDS = ["first_name", "username", "channels_condition", "started"];

const buildUpdateDoc = (body) => {
    const $set = {};
    for (const key of WRITABLE_FIELDS) {
        if (body[key] !== undefined) $set[key] = body[key];
    }
    return Object.keys($set).length ? { $set } : {};
};

/**
 * Filtr qiymati doim string ga keltiriladi.
 * Aks holda {"telegram_id": {"$ne": null}} kabi tana orqali yuborilgan
 * operator to'g'ridan-to'g'ri so'rov filtriga tushib ketardi.
 */
const byTelegramId = (value) => ({ telegram_id: String(value) });

/**
 * Odam botga O'ZI yozdi — demak chat ochiq va bot unga yoza oladi.
 *
 * NEGA BELGILAR TOZALANADI: `blocked` reklama tarqatishda 403 kelganda,
 * `unreachable` esa 400 "chat not found" kelganda qo'yiladi va ikkalasi
 * ham reklamadan CHIQARIB TASHLAYDI. Odam keyin botni blokdan chiqarib
 * qayta yozsa yoki eski "kanal orqali kelgan" yozuv egasi birinchi marta
 * botga yozsa, belgi eskiligicha qolib ketardi — natijada haqiqiy,
 * xabar olishga tayyor odam reklama ro'yxatidan tushib qolardi.
 * Bazada hozir 24 ta bloklagan va 56 mingdan ortiq "yetib bo'lmaydi"
 * belgili yozuv bor, ya'ni bu jim yo'qotish katta bo'lishi mumkin edi.
 */
const PROOF_OF_LIFE = { started: true, blocked: false, unreachable: false };

/** buildUpdateDoc natijasiga qo'shimcha maydonlarni qo'shadi */
const withSet = (doc, extra) => ({ ...doc, $set: { ...(doc.$set || {}), ...extra } });

export const UserService = {
    async createUser(body) {
        // Bu metod faqat /start dan chaqiriladi — demak odam botga O'ZI yozgan
        body = { ...body, started: true };

        const data = await UserModel.findOneAndUpdate(
            byTelegramId(body.telegram_id),
            {
                ...withSet(buildUpdateDoc(body), PROOF_OF_LIFE),
                $setOnInsert: byTelegramId(body.telegram_id),
            },
            { returnDocument: "after", upsert: true, runValidators: true }
        ).lean()
        return data
    },

    async updateUser(body) {
        // Bot bu metodni har xabarda chaqiradi. Ilgari 3 ta KETMA-KET Atlas so'rovi
        // bor edi (~190ms). Endi: ikkala o'qish parallel, kanallar esa keshdan
        // (odatda 0 ta qo'shimcha so'rov) — jami ~1 ta DB safari.
        const [existingUser, activeChannels] = await Promise.all([
            UserModel.findOne(byTelegramId(body.telegram_id))
                .select("channels_condition")
                .lean(),
            ChannelService.getChannels()
        ]);
        let newConditions = body.channels_condition || [];
        const activeIds = new Set();

        const mergedMap = new Map();

        // Barcha aktiv kanallarni default qiymatlar bilan kiritamiz
        activeChannels.forEach(c => {
            activeIds.add(c.telegram_id);
            mergedMap.set(c.telegram_id, {
                telegram_id: c.telegram_id,
                name: c.name,
                is_member: false,
                has_joined: false
            });
        });

        if (existingUser && existingUser.channels_condition) {
            existingUser.channels_condition.forEach(c => {
                // Faqat aktiv kanallarni qoldiramiz va eskilarini ustiga yozamiz
                if (c && c.telegram_id && activeIds.has(c.telegram_id)) {
                    mergedMap.set(c.telegram_id, {
                        ...mergedMap.get(c.telegram_id),
                        ...c
                    });
                }
            });
        }

        if (newConditions.length > 0) {
            newConditions.forEach(newC => {
                if (!activeIds.has(newC.telegram_id)) return;
                
                const oldC = mergedMap.get(newC.telegram_id) || {};
                const hasJoinedItem = newC.is_member || oldC.has_joined || false;

                mergedMap.set(newC.telegram_id, {
                    ...oldC,
                    ...newC,
                    has_joined: hasJoinedItem
                });
            });
        }

        if (body.channels_condition) {
            body.channels_condition = Array.from(mergedMap.values());
        }

        /**
         * A'zolik O'ZGARGAN bo'lsa — hodisa yozuvi.
         *
         * `channels_condition` faqat hozirgi holatni saqlaydi, shuning
         * uchun "qachon qo'shildi, qachon chiqdi" degan savolga javob
         * yo'q edi. Bu yer yagona o'tish nuqtasi: obuna tekshiruvi ham,
         * kanaldagi chat_member hodisasi ham shu metodga keladi.
         *
         * Faqat BIZNING foydalanuvchimiz (started) hisobga olinadi —
         * botni ochmagan, kanalga chetdan kelgan odam bu yerga tushmaydi.
         */
        if (body.channels_condition && existingUser) {
            const wasMember = new Map(
                (existingUser.channels_condition || []).map((c) => [c.telegram_id, c.is_member === true])
            );

            const events = [];
            for (const c of body.channels_condition) {
                const before = wasMember.get(c.telegram_id);
                // Yangi kanal (before === undefined) hali hodisa emas:
                // bu shunchaki ro'yxatga qo'shilgani, odam harakat qilmagan
                if (before === undefined || before === (c.is_member === true)) continue;
                events.push({
                    telegram_id: String(body.telegram_id),
                    channel_id: c.telegram_id,
                    channel_name: c.name,
                    action: c.is_member ? "join" : "leave",
                });
            }

            if (events.length) {
                ChannelEventModel.insertMany(events).catch((e) =>
                    logger.warn(`[Kanal] hodisa yozilmadi: ${e.message}`)
                );
            }
        }

        // YARATISH faqat odam botga O'ZI yozganda (started: true).
        //
        // Kanalga qo'shilish hodisasi yangi yozuv YARATMAYDI: bunday odam
        // botga hech qachon yozmagan, unga xabar ham yubora olmaymiz.
        // Ilgari bunday holatda ham upsert ishlagani uchun bazada 56 000 ta
        // fantom yozuv to'plangan edi — ular boshqa odamlarning botlaridan
        // majburiy obuna kanaliga kelganlar edi.
        //
        // MAVJUD foydalanuvchi esa yangilanaveradi: haqiqiy foydalanuvchi
        // kanaldan chiqsa, buni bilishimiz shart (media qulflanadi va
        // obuna qaytadan so'raladi).
        const isRealUser = body.started === true;

        const data = await UserModel.findOneAndUpdate(
            byTelegramId(body.telegram_id),
            isRealUser
                ? {
                    ...withSet(buildUpdateDoc(body), PROOF_OF_LIFE),
                    $setOnInsert: byTelegramId(body.telegram_id),
                }
                // Kanal hodisasi: yozuv yaratilmaydi va "yetib bo'lmaydi"
                // belgilari ham o'chirilmaydi — bu odam botga yozmadi
                : buildUpdateDoc(body),
            { returnDocument: "after", upsert: isRealUser, runValidators: true }
        ).lean()
        return data
    },

    async getUsers(queryParams) {
        const { page = 1, limit = 50, is_subscribed, channel_id } = queryParams;

        let filter = {};
        let andConditions = [];

        if (channel_id) {
            andConditions.push({
                channels_condition: { $elemMatch: { telegram_id: channel_id, is_member: true } }
            });
        }

        if (is_subscribed === 'true') {
            andConditions.push({
                channels_condition: {
                    $exists: true,
                    $type: 'array',
                    $ne: [],
                    $not: { $elemMatch: { is_member: false } }
                }
            });
        } else if (is_subscribed === 'false') {
            andConditions.push({
                $or: [
                    { channels_condition: { $exists: false } },
                    { channels_condition: { $size: 0 } },
                    { channels_condition: { $elemMatch: { is_member: false } } }
                ]
            });
        }

        if (andConditions.length > 0) {
            filter.$and = andConditions;
        }

        // Limit validatsiya bosqichida 200 bilan cheklangan; bu yerda qo'shimcha himoya.
        const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
        const safePage = Math.max(parseInt(page) || 1, 1);
        const skip = (safePage - 1) * safeLimit;

        const [users, totalDocs] = await Promise.all([
            UserModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(safeLimit)
                .lean(),
            UserModel.countDocuments(filter)
        ]);

        return {
            users,
            totalDocs,
            page: safePage,
            limit: safeLimit,
            totalPages: Math.ceil(totalDocs / safeLimit)
        };
    },

    async getUserByTelegramId(telegram_id) {
        return await UserModel.findOne(byTelegramId(telegram_id)).lean();
    }
}