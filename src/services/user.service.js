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
const PROOF_OF_LIFE = { started: true, blocked: false, blocked_at: null, unreachable: false };

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
                .select("channels_condition started")
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
         * BOT ORQALI qo'shilish va chiqish hodisalari.
         *
         * Ikki shart, ikkalasi ham majburiy:
         *
         *   1) Odam botga O'ZI yozgan bo'lishi kerak (bazadagi `started`).
         *      Ilgari bu tekshirilmagan edi: bazada majburiy kanaldan kelgan
         *      56 mingdan ortiq eski yozuv bor va ular kanalga kirib-chiqib
         *      turadi — natijada botda 62 ta foydalanuvchi bo'la turib
         *      grafikda 7 kunda 59 ta "chiqib ketgan" ko'rindi.
         *
         *   2) Chiqish faqat BOT ORQALI qo'shilgani yozilgan odam uchun.
         *      Botni ochishdan oldin ham kanalda bo'lgan odam chiqsa, u
         *      majburiy obuna samarasini ko'rsatmaydi. Qo'shilish yozilganda
         *      kanal holatiga `joined_via_bot` belgisi qo'yiladi, chiqishda
         *      shu belgi tekshiriladi va olib tashlanadi.
         *
         * Bot birinchi marta ko'rgan holat (`before === undefined`) hodisa
         * emas — bu faqat ro'yxatga olish, odam harakat qilmagan.
         */
        if (body.channels_condition && existingUser?.started) {
            const previous = new Map(
                (existingUser.channels_condition || []).map((c) => [c.telegram_id, c])
            );

            const events = [];
            for (const c of body.channels_condition) {
                const old = previous.get(c.telegram_id);
                const before = old ? old.is_member === true : undefined;
                const now = c.is_member === true;
                if (before === undefined || before === now) continue;

                if (now) {
                    c.joined_via_bot = true;
                    events.push({
                        telegram_id: String(body.telegram_id),
                        channel_id: c.telegram_id,
                        channel_name: c.name,
                        action: "join",
                    });
                } else {
                    if (old.joined_via_bot === true) {
                        events.push({
                            telegram_id: String(body.telegram_id),
                            channel_id: c.telegram_id,
                            channel_name: c.name,
                            action: "leave",
                        });
                    }
                    c.joined_via_bot = false;
                }
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
        const { page = 1, limit = 50, is_subscribed, channel_id, bot_status } = queryParams;

        /**
         * FAQAT botga o'zi yozgan foydalanuvchilar.
         *
         * Bazada 1-sentyabrgacha majburiy kanal orqali tushib qolgan
         * 56 mingdan ortiq yozuv bor: ular botni hech qachon ochmagan va
         * bot ularga yoza olmaydi. Ular bazadan ATAYLAB o'chirilmagan,
         * lekin admin panelda ko'rinmasligi kerak — aks holda "jami
         * foydalanuvchilar" soni haqiqatdan 900 barobar katta chiqardi.
         * Bu yo'l faqat admin uchun (bot bu ro'yxatni so'ramaydi).
         */
        const base = [{ started: true }];

        /**
         * Obuna holati. Kanal tanlanganda — faqat SHU kanal bo'yicha,
         * aks holda barcha majburiy kanallar bo'yicha (hammasiga a'zo).
         */
        let subscribedCond, unsubscribedCond;
        if (channel_id) {
            const member = { $elemMatch: { telegram_id: String(channel_id), is_member: true } };
            subscribedCond = { channels_condition: member };
            unsubscribedCond = { channels_condition: { $not: member } };
        } else {
            subscribedCond = {
                channels_condition: {
                    $exists: true,
                    $type: 'array',
                    $ne: [],
                    $not: { $elemMatch: { is_member: false } }
                }
            };
            unsubscribedCond = {
                $or: [
                    { channels_condition: { $exists: false } },
                    { channels_condition: { $size: 0 } },
                    { channels_condition: { $elemMatch: { is_member: false } } }
                ]
            };
        }

        /**
         * Bot bilan aloqa holati:
         *   blocked     — botni bloklagan (Telegram 403 / my_chat_member kicked)
         *   unreachable — akkaunti o'chirilgan: bloklamagan, lekin yozib bo'lmaydi
         *   active      — qolganlari, bot xabar yubora oladi
         */
        const BOT_STATUS = {
            blocked: { blocked: true },
            unreachable: { unreachable: true, blocked: { $ne: true } },
            active: { blocked: { $ne: true }, unreachable: { $ne: true } },
        };

        const andConditions = [...base];
        if (is_subscribed === 'true') andConditions.push(subscribedCond);
        else if (is_subscribed === 'false') andConditions.push(unsubscribedCond);
        if (BOT_STATUS[bot_status]) andConditions.push(BOT_STATUS[bot_status]);
        const filter = { $and: andConditions };

        // Limit validatsiya bosqichida 200 bilan cheklangan; bu yerda qo'shimcha himoya.
        const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
        const safePage = Math.max(parseInt(page) || 1, 1);
        const skip = (safePage - 1) * safeLimit;

        const [users, totalDocs, all, subscribed, blocked, unreachable] = await Promise.all([
            UserModel.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(safeLimit)
                .lean(),
            UserModel.countDocuments(filter),
            // Holat filtridan qat'i nazar jami va obunachilar soni —
            // panel kartochkalari sahifadagi 50 ta emas, hammasini sanaydi
            UserModel.countDocuments({ $and: base }),
            UserModel.countDocuments({ $and: [...base, subscribedCond] }),
            UserModel.countDocuments({ $and: [...base, BOT_STATUS.blocked] }),
            UserModel.countDocuments({ $and: [...base, BOT_STATUS.unreachable] }),
        ]);

        return {
            users,
            totalDocs,
            counts: { all, subscribed, unsubscribed: all - subscribed, blocked, unreachable },
            page: safePage,
            limit: safeLimit,
            totalPages: Math.ceil(totalDocs / safeLimit)
        };
    },

    /**
     * Foydalanuvchi botni bloklagan / blokdan chiqargan — Telegram buni
     * darhol xabar qiladi (`my_chat_member`, shaxsiy chat).
     *
     * FAQAT mavjud yozuv yangilanadi, yangi yaratilmaydi: bloklash botga
     * "yozish" emas va bazada bo'lmagan odam uchun yozuv ochish yana
     * fantom foydalanuvchilarni ko'paytirardi.
     */
    async setBotStatus({ telegram_id, status }) {
        const blocked = status === "kicked";
        const res = await UserModel.updateOne(
            byTelegramId(telegram_id),
            blocked
                ? { $set: { blocked: true, blocked_at: new Date() } }
                : { $set: { blocked: false, blocked_at: null } }
        );
        return { matched: res.matchedCount > 0, blocked };
    },

    async getUserByTelegramId(telegram_id) {
        return await UserModel.findOne(byTelegramId(telegram_id)).lean();
    }
}