import { DiscoveredChatModel } from "../models/discovered-chat.model.js";
import { ChannelModel } from "../models/channels.model.js";
import { currentTenant } from "../core/tenant-context.js";
import { CONFIG } from "../config/index.js";
import { getBotApi } from "../utils/telegram.js";

/** Telegram ID ni bir ko'rinishga keltiradi: "-1003831468244" */
const normalizeId = (value) => {
    const s = String(value ?? "").trim();
    if (!s) return null;
    if (s.startsWith("-100")) return s;
    if (s.startsWith("-")) return s;
    // Faqat raqam berilgan bo'lsa (masalan "3831468244") — kanal prefiksini qo'shamiz
    return /^\d+$/.test(s) ? `-100${s}` : s;
};

const ADMIN_STATUSES = ["administrator", "creator"];

export const DiscoveredChatService = {
    /**
     * Bot `my_chat_member` hodisasini yuborganda chaqiriladi.
     * Bot chatdan chiqarilgan bo'lsa yozuv o'chiriladi.
     */
    async upsertFromBot(payload = {}) {
        const telegram_id = normalizeId(payload.telegram_id ?? payload.chatId ?? payload.id);
        if (!telegram_id) {
            throw Object.assign(new Error("telegram_id majburiy"), { status: 400 });
        }

        const status = String(payload.bot_status || payload.status || "member");

        // Bot chatdan chiqarilgan/bloklangan — ro'yxatda saqlashning ma'nosi yo'q
        if (["left", "kicked"].includes(status)) {
            await DiscoveredChatModel.deleteOne({ telegram_id });
            return { removed: true, telegram_id };
        }

        const doc = await DiscoveredChatModel.findOneAndUpdate(
            { telegram_id },
            {
                $set: {
                    title: payload.title || "",
                    username: payload.username || null,
                    type: payload.type || "channel",
                    bot_status: status,
                    is_admin: ADMIN_STATUSES.includes(status),
                    can_invite_users: Boolean(payload.can_invite_users),
                    last_seen: new Date(),
                },
            },
            { upsert: true, returnDocument: "after", runValidators: true }
        ).lean();

        return { saved: true, chat: doc };
    },

    /**
     * Panel uchun ro'yxat: bot a'zo bo'lgan chatlar + ularning JONLI holati.
     *
     * Ro'yxat uch manbadan yig'iladi, chunki Telegram enumeratsiya bermaydi:
     *   1) `my_chat_member` orqali topilganlar (kelajakda avtomatik to'ladi)
     *   2) allaqachon qo'shilgan kanallar (ChannelModel)
     *   3) shu botning media kanali (.env dagi CHANNEL_IDn)
     */
    async listAvailable({ refresh = true } = {}) {
        const [discovered, channels] = await Promise.all([
            DiscoveredChatModel.find().lean(),
            ChannelModel.find().select("telegram_id name").lean(),
        ]);

        const merged = new Map();

        for (const d of discovered) {
            merged.set(normalizeId(d.telegram_id), {
                telegram_id: normalizeId(d.telegram_id),
                title: d.title,
                username: d.username,
                type: d.type,
                bot_status: d.bot_status,
                is_admin: d.is_admin,
                can_invite_users: d.can_invite_users,
                member_count: d.member_count,
                source: "discovered",
            });
        }

        for (const c of channels) {
            const id = normalizeId(c.telegram_id);
            if (!merged.has(id)) {
                merged.set(id, {
                    telegram_id: id, title: c.name, username: null, type: "channel",
                    bot_status: "unknown", is_admin: false, can_invite_users: false,
                    member_count: null, source: "channel",
                });
            }
        }

        const tenantChannelId = currentTenant()?.channelId;
        if (tenantChannelId) {
            const id = normalizeId(tenantChannelId);
            if (!merged.has(id)) {
                merged.set(id, {
                    telegram_id: id, title: "(media kanali)", username: null, type: "channel",
                    bot_status: "unknown", is_admin: false, can_invite_users: false,
                    member_count: null, source: "env",
                });
            }
        }

        const list = [...merged.values()];

        // Jonli holat: har biri uchun getChat + getChatMember.
        // Telegram limitiga urilmaslik uchun kichik to'plamlar bilan.
        if (refresh && list.length) {
            await this._refreshStatuses(list);
        }

        // Qaysilari allaqachon obuna kanali sifatida qo'shilgan
        const addedIds = new Set(channels.map((c) => normalizeId(c.telegram_id)));
        for (const item of list) {
            item.already_added = addedIds.has(item.telegram_id);
        }

        // Admin bo'lganlar tepada — ular qo'shishga yaroqli
        list.sort((a, b) =>
            (b.is_admin ? 1 : 0) - (a.is_admin ? 1 : 0) ||
            String(a.title).localeCompare(String(b.title))
        );

        return list;
    },

    /** Har bir chat uchun Telegramdan joriy holatni oladi (parallel, cheklangan) */
    async _refreshStatuses(list) {
        let botApi, botId;
        try {
            botApi = await getBotApi();
            botId = (await botApi.getMe()).id;
        } catch {
            return; // bot tokeni yo'q — bazadagi holat bilan qaytamiz
        }

        const CONCURRENCY = 5;
        for (let i = 0; i < list.length; i += CONCURRENCY) {
            await Promise.all(list.slice(i, i + CONCURRENCY).map(async (item) => {
                try {
                    const [chat, member, count] = await Promise.all([
                        botApi.getChat(item.telegram_id).catch(() => null),
                        botApi.getChatMember(item.telegram_id, botId).catch(() => null),
                        botApi.getChatMemberCount(item.telegram_id).catch(() => null),
                    ]);

                    if (chat) {
                        item.title = chat.title || item.title;
                        item.username = chat.username || item.username;
                        item.type = chat.type || item.type;
                    }
                    if (member) {
                        item.bot_status = member.status;
                        item.is_admin = ADMIN_STATUSES.includes(member.status);
                        item.can_invite_users =
                            member.status === "creator" || member.can_invite_users === true;
                    } else {
                        item.bot_status = "unreachable";
                        item.is_admin = false;
                    }
                    if (count !== null) item.member_count = count;

                    // Yangilangan holatni saqlaymiz
                    await DiscoveredChatModel.updateOne(
                        { telegram_id: item.telegram_id },
                        {
                            $set: {
                                title: item.title, username: item.username, type: item.type,
                                bot_status: item.bot_status, is_admin: item.is_admin,
                                can_invite_users: item.can_invite_users,
                                member_count: item.member_count, last_seen: new Date(),
                            },
                        },
                        { upsert: true }
                    );
                } catch {
                    item.bot_status = "unreachable";
                    item.is_admin = false;
                }
            }));
        }
    },
};
