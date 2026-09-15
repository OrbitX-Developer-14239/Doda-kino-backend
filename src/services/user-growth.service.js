import { UserModel } from "../models/user.model.js";

/**
 * ============================================
 *  Foydalanuvchilar o'sishi (admin panel grafigi uchun)
 * ============================================
 *
 * NIMANI SANAYDI — VA NIMANI ATAYLAB SANAMAYDI:
 * Bazadagi har yozuv ham foydalanuvchi emas. Majburiy obuna kanaliga
 * qo'shilgan odam ham ilgari yozuv bo'lib tushardi — "Doda Kino" da
 * 56 mingdan ortiq yozuvning atigi 62 tasi botga haqiqatan yozgan.
 * Ikkalasini bitta grafikka qo'yib bo'lmaydi: masshtab farqi 1000
 * barobar, haqiqiy foydalanuvchilar chizig'i nolga yopishib ko'rinmay
 * qolardi.
 *
 * Shuning uchun grafik bir xil masshtabdagi ikki chiziqni beradi:
 *   started — botga o'zi yozgan (haqiqiy foydalanuvchi)
 *   active  — ulardan HOZIR ham botni bloklamaganlari
 * "Barcha yozuvlar" soni esa grafikda emas, `totals` da raqam sifatida
 * qaytadi — u yashirilmaydi, lekin chiziqlarni ham buzmaydi.
 *
 * `active` haqida: blok qachon qilingani saqlanmaydi, faqat hozirgi
 * holati bor. Demak "12-sentyabrgacha kelganlardan hozir nechtasi faol"
 * degan kohort ma'nosida o'qiladi — yorliq ham shunday nomlanadi.
 */

/**
 * Toshkent vaqti. O'zbekistonda 1992-yildan beri yozgi vaqt yo'q, ya'ni
 * siljish doimiy +5 — kun chegarasini hisoblash uchun kutubxona shart emas.
 */
const TZ = "Asia/Tashkent";
const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "Hammasi" tanlanganda ham grafik cheksiz uzaymasin */
const MAX_DAYS = 730;

export const ALLOWED_RANGES = ["7", "30", "90", "all"];

/** Sana -> Toshkent bo'yicha "YYYY-MM-DD" */
const dayKey = (date) => new Date(date.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);

/** "YYYY-MM-DD" (Toshkent) -> o'sha kun boshining UTC vaqti */
const dayStartUtc = (key) => new Date(Date.parse(`${key}T00:00:00Z`) - TZ_OFFSET_MS);

const ACTIVE = { blocked: { $ne: true } };

export const UserGrowthService = {
    /**
     * @param {"7"|"30"|"90"|"all"} range
     * @returns {{ range, totals, points: Array }}
     */
    async getGrowth(range = "30") {
        const todayKey = dayKey(new Date());

        // Oraliqning birinchi kuni
        let fromKey;
        if (range === "all") {
            const first = await UserModel.findOne({ started: true })
                .sort({ createdAt: 1 })
                .select("createdAt")
                .lean();
            fromKey = first?.createdAt ? dayKey(first.createdAt) : todayKey;
        } else {
            const days = Number(range);
            fromKey = dayKey(new Date(dayStartUtc(todayKey).getTime() - (days - 1) * DAY_MS));
        }

        // Juda uzun oraliqni kesamiz
        const earliestKey = dayKey(new Date(dayStartUtc(todayKey).getTime() - (MAX_DAYS - 1) * DAY_MS));
        if (fromKey < earliestKey) fromKey = earliestKey;

        const from = dayStartUtc(fromKey);
        const startedInRange = { started: true, createdAt: { $gte: from } };

        const [perDay, baseStarted, baseActive, records, started, active] = await Promise.all([
            UserModel.aggregate([
                { $match: startedInRange },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
                        started: { $sum: 1 },
                        active: { $sum: { $cond: [{ $ne: ["$blocked", true] }, 1, 0] } },
                    },
                },
            ]),
            // Oraliqdan OLDIN yig'ilganlar — "jami" chiziq noldan emas, haqiqiy
            // darajadan boshlanishi uchun
            UserModel.countDocuments({ started: true, createdAt: { $lt: from } }),
            UserModel.countDocuments({ started: true, ...ACTIVE, createdAt: { $lt: from } }),
            UserModel.estimatedDocumentCount(),
            UserModel.countDocuments({ started: true }),
            UserModel.countDocuments({ started: true, ...ACTIVE }),
        ]);

        const byDay = new Map(perDay.map((d) => [d._id, d]));

        /**
         * Har kun ALOHIDA nuqta — yangi foydalanuvchi bo'lmagan kunlar ham.
         * Bazaning o'zi faqat hodisa bo'lgan kunlarni qaytaradi; ular
         * to'g'ridan-to'g'ri chizilsa, 3 va 8-sentyabr qo'shni nuqta bo'lib,
         * chiziq oradagi bo'sh kunlarni "sakrab" o'tardi va o'sish
         * haqiqatdagidan tekis ko'rinardi.
         */
        const points = [];
        let totalStarted = baseStarted;
        let totalActive = baseActive;

        for (let t = from.getTime(); dayKey(new Date(t)) <= todayKey; t += DAY_MS) {
            const key = dayKey(new Date(t));
            const row = byDay.get(key);
            const newStarted = row?.started || 0;
            const newActive = row?.active || 0;
            totalStarted += newStarted;
            totalActive += newActive;

            points.push({ date: key, newStarted, newActive, totalStarted, totalActive });
        }

        return {
            range: { key: range, from: fromKey, to: todayKey, days: points.length, timezone: TZ },
            totals: {
                // Bazadagi barcha yozuvlar, kanal orqali kelganlar ham
                records,
                started,
                active,
                blocked: started - active,
            },
            points,
        };
    },
};
