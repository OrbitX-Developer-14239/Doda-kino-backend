import { UserModel } from "../models/user.model.js";
import { ChannelModel } from "../models/channels.model.js";
import { ChannelEventModel } from "../models/channel-event.model.js";
import { dayKey, dayRange, daysAgoKey, dayStartUtc, todayKey, TZ } from "../utils/day.js";

/**
 * ============================================
 *  Majburiy kanallar: qo'shilish va chiqish
 * ============================================
 *
 * Kunlik raqamlar `channel_events` to'plamidan olinadi — u BOT ORQALI
 * sodir bo'lgan o'zgarishlarni yozib boradi (batafsil izoh modelda).
 * Tarix shu xizmat ishga tushgan kundan boshlanadi.
 *
 * `members` esa hozirgi holat: foydalanuvchi hujjatidagi
 * `channels_condition` dan sanaladi va u boshidan beri to'g'ri.
 * Ya'ni "hozir 20 ta a'zo bor" degan raqam kunlik qatorlar yig'indisiga
 * teng bo'lmasligi mumkin — panel buni ochiq yozadi.
 */

export const ALLOWED_CHANNEL_RANGES = ["7", "30", "90", "all"];
const DAYS = { 7: 7, 30: 30, 90: 90 };

export const ChannelStatsService = {
    async getJoins(range = "30") {
        const channels = await ChannelModel.find()
            .select("telegram_id name is_active")
            .sort({ createdAt: 1 })
            .lean();

        const firstEvent = await ChannelEventModel.findOne()
            .sort({ createdAt: 1 })
            .select("createdAt")
            .lean();

        let fromKey;
        if (range === "all") {
            // Birinchi hodisadan boshlaymiz; hodisa yo’q bo’lsa bugungi kun
            fromKey = firstEvent?.createdAt ? dayKey(firstEvent.createdAt) : todayKey();
            const earliest = daysAgoKey(730);
            if (fromKey < earliest) fromKey = earliest;
        } else {
            fromKey = daysAgoKey(DAYS[range] || 30);
        }

        const from = dayStartUtc(fromKey);

        const [rows, memberCounts] = await Promise.all([
            ChannelEventModel.aggregate([
                { $match: { createdAt: { $gte: from } } },
                {
                    $group: {
                        _id: {
                            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
                            channel: "$channel_id",
                            action: "$action",
                        },
                        count: { $sum: 1 },
                    },
                },
            ]),
            // Hozirgi a'zolar — faqat botga o'zi yozgan foydalanuvchilar ichida
            Promise.all(
                channels.map((c) =>
                    UserModel.countDocuments({
                        started: true,
                        channels_condition: { $elemMatch: { telegram_id: c.telegram_id, is_member: true } },
                    })
                )
            ),
        ]);

        const byDay = new Map();
        for (const r of rows) {
            const day = byDay.get(r._id.day) || { channels: {} };
            const ch = day.channels[r._id.channel] || { join: 0, leave: 0 };
            ch[r._id.action] = r.count;
            day.channels[r._id.channel] = ch;
            byDay.set(r._id.day, day);
        }

        // Har kun alohida nuqta — hodisa bo'lmagan kunlar ham nol bilan
        const points = dayRange(fromKey).map((day) => {
            const entry = byDay.get(day) || { channels: {} };
            let join = 0;
            let leave = 0;
            const perChannel = {};
            for (const c of channels) {
                const v = entry.channels[c.telegram_id] || { join: 0, leave: 0 };
                perChannel[c.telegram_id] = v;
                join += v.join;
                leave += v.leave;
            }
            return { date: day, join, leave, channels: perChannel };
        });

        const sum = (id, action) =>
            points.reduce((a, p) => a + (id ? p.channels[id][action] : p[action]), 0);

        return {
            range: { key: range, from: fromKey, to: todayKey(), days: points.length, timezone: TZ },
            trackingSince: firstEvent?.createdAt ? dayKey(firstEvent.createdAt) : null,
            channels: channels.map((c, i) => ({
                telegram_id: c.telegram_id,
                name: c.name,
                is_active: c.is_active,
                members: memberCounts[i],
                joined: sum(c.telegram_id, "join"),
                left: sum(c.telegram_id, "leave"),
            })),
            totals: {
                // Kanallar bo’yicha YIG’INDI a’zolik: ikkala kanalga ham a’zo odam
                // ikki marta sanaladi — panel buni shunday nomlaydi
                memberships: memberCounts.reduce((a, b) => a + b, 0),
                joined: sum(null, "join"),
                left: sum(null, "leave"),
            },
            points,
        };
    },
};
