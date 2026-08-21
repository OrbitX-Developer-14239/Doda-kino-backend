import { ChannelModel } from "../models/channels.model.js"
import { UserModel } from "../models/user.model.js"
import { getBotApi } from "../utils/telegram.js"
import { requireTenant } from "../core/tenant-context.js"
import { cache } from "./cache.service.js"

// Kanallar ro'yxati botning ENG issiq yo'li — har xabarda so'raladi, lekin
// o'zi juda kam o'zgaradi. Qisqa TTL kesh har so'rovdagi ~60ms lik Atlas
// safarini olib tashlaydi. Yaratish/tahrirlash/o'chirish shu jarayonning
// o'zida keshni darhol tozalaydi, shuning uchun eskirgan ma'lumot ko'rinmaydi.
//
// DIQQAT — HAR BOT UCHUN ALOHIDA (botId bo'yicha Map). Ilgari bitta umumiy
// o'zgaruvchi edi: 1-bot so'raganda to'lib, 30 soniya ichida 2-bot so'rasa
// unga 1-BOTNING kanallari qaytardi — yangi botlar hech qanday kanal
// qo'shilmagan bo'lsa ham begona kanalga obuna so'rab turardi.
const CHANNELS_CACHE_TTL_MS = 30 * 1000;
const channelsCacheByBot = new Map(); // botId -> { data, at }

// Kanal o'zgarganda IKKALA kesh ham tozalanadi:
//   1) shu jarayondagi Map (backend o'zi uchun)
//   2) Redis — bot o'sha yerdan o'qiydi va versiya orqali o'z keshini tashlaydi
const invalidateChannelsCache = async () => {
    channelsCacheByBot.delete(requireTenant("kanal keshi").botId);
    await cache.invalidateChannels();
};

export const ChannelService = {
    async checkStatus(channelId) {
        const botApi = await getBotApi();

        try {
            const botInfo = await botApi.getMe();
            const botMember = await botApi.getChatMember(channelId, botInfo.id);
            const chat = await botApi.getChat(channelId);

            const isAdmin = botMember.status === "administrator" || botMember.status === "creator";

            if (!isAdmin) {
                return {
                    is_admin: false,
                    status: botMember.status,
                    permissions: null,
                    message: "Bot ushbu kanal/guruhda admin emas!"
                };
            }

            const canInvite = botMember.status === "creator" || botMember.can_invite_users === true;
            if (!canInvite) {
                return {
                    is_admin: false,
                    status: botMember.status,
                    permissions: botMember,
                    message: "Bot kanalda admin, lekin u uchun 'Foydalanuvchilarni taklif qilish' (can_invite_users / Add Users) huquqi yoqilmagan!"
                };
            }

            const { status, user, ...permissions } = botMember;

            return {
                is_admin: true,
                chat_id: String(chat.id),
                ...permissions
            };
        } catch (err) {
            const error = new Error(`Telegram API xatoligi: ${err.message}`);
            error.status = 400;
            throw error;
        }
    },

    async generateInviteLink(channelId, joinType = "request") {
        const botApi = await getBotApi();
        const createsJoinRequest = joinType === "request";

        try {
            const res = await botApi.createChatInviteLink(channelId, {
                creates_join_request: createsJoinRequest,
                name: createsJoinRequest ? "Zayafkali obuna" : "Oddiy obuna"
            });
            return res.invite_link;
        } catch (err) {
            console.error("[ChannelService] createChatInviteLink xatosi:", err.message);
            if (err.message?.includes("not enough rights")) {
                const error = new Error("Bot kanalda admin, lekin u uchun 'Foydalanuvchilarni taklif qilish' (can_invite_users / Add Users) huquqi yoqilmagan! Telegram kanal sozlamalaridan botga ushbu huquqni bering.");
                error.status = 400;
                throw error;
            }
            const error = new Error(`Telegram taklif havolasini yaratishda xatolik: ${err.message}`);
            error.status = 400;
            throw error;
        }
    },

    async createChannel(body) {
        const existChannel = await ChannelModel.findOne({ telegram_id: body.telegram_id });

        if (existChannel) {
            const error = new Error("Bu kanal bazada allaqachon mavjud!");
            error.status = 409;
            throw error;
        }

        const status = await this.checkStatus(body.telegram_id);

        if (!status.is_admin) {
            const error = new Error(status.message);
            error.status = 400;
            throw error;
        }

        const joinType = body.join_type || "request";
        const realTelegramId = status.chat_id || body.telegram_id;
        let inviteLink;

        try {
            inviteLink = await this.generateInviteLink(realTelegramId, joinType);
        } catch (e) {
            if (body.invite_link) {
                inviteLink = body.invite_link;
            } else {
                throw e;
            }
        }

        const data = await ChannelModel.create({
            ...body,
            telegram_id: realTelegramId,
            invite_link: inviteLink,
            join_type: joinType,
            isPrivate: body.isPrivate || false,
            bot_permissions: status
        });

        await invalidateChannelsCache();
        return data;
    },

    async getChannels() {
        const botId = requireTenant("kanallar ro'yxati").botId;
        const cached = channelsCacheByBot.get(botId);
        if (cached && Date.now() - cached.at < CHANNELS_CACHE_TTL_MS) {
            return cached.data;
        }

        const data = await ChannelModel.find().lean();
        channelsCacheByBot.set(botId, { data, at: Date.now() });
        return data;
    },

    async getChannelById(id) {
        const existChannel = await ChannelModel.findById(id);

        if (!existChannel) {
            const error = new Error("Kanal topilmadi!");
            error.status = 404;
            throw error;
        }

        const channelTid = existChannel.telegram_id;

        // Telegramdan faqat bitta yig'ma so'rov. Obuna holati esa bazadagi
        // channels_condition dan hisoblanadi — ilgari bu yerda har bir foydalanuvchi
        // uchun alohida getChatMember chaqirilardi va bu Telegram limitiga urilardi.
        const [telegramMemberCount, aggregated] = await Promise.all([
            (async () => {
                try {
                    const botApi = await getBotApi();
                    return await botApi.getChatMemberCount(channelTid);
                } catch (e) {
                    console.error("Failed to get chat member count:", e.message);
                    return 0;
                }
            })(),
            UserModel.aggregate([
                { $match: { "channels_condition.telegram_id": channelTid } },
                {
                    $project: {
                        entry: {
                            $arrayElemAt: [
                                {
                                    $filter: {
                                        input: { $ifNull: ["$channels_condition", []] },
                                        as: "c",
                                        cond: { $eq: ["$$c.telegram_id", channelTid] }
                                    }
                                },
                                0
                            ]
                        }
                    }
                },
                {
                    $group: {
                        _id: null,
                        tracked: { $sum: 1 },
                        joined: { $sum: { $cond: [{ $eq: ["$entry.has_joined", true] }, 1, 0] } },
                        active: { $sum: { $cond: [{ $eq: ["$entry.is_member", true] }, 1, 0] } }
                    }
                }
            ])
        ]);

        const stats = aggregated[0] || { tracked: 0, joined: 0, active: 0 };
        const joinedViaBot = stats.joined || 0;

        return {
            ...existChannel.toObject(),
            statistics: {
                total_members: telegramMemberCount,
                tracked_users: stats.tracked || 0,
                joined_via_bot: joinedViaBot,
                active_members: stats.active || 0,
                left_via_bot: Math.max(0, joinedViaBot - (stats.active || 0))
            }
        };
    },

    async updateChannel(id, body) {
        const existChannel = await ChannelModel.findById(id);

        if (!existChannel) {
            const error = new Error("Kanal topilmadi!");
            error.status = 404;
            throw error;
        }

        const status = await this.checkStatus(existChannel.telegram_id);
        if (!status.is_admin) {
            const error = new Error(status.message);
            error.status = 400;
            throw error;
        }

        const realTelegramId = status.chat_id || existChannel.telegram_id;
        let newJoinType = body.join_type || existChannel.join_type;
        let newInviteLink = existChannel.invite_link;

        // Agar join_type o'zgarsa yoki invite_link mavjud bo'lmasa, yangi taklif havolasi yaratamiz
        if (body.join_type || !existChannel.invite_link) {
            newInviteLink = await this.generateInviteLink(realTelegramId, newJoinType);
        }

        if (body.name !== undefined) existChannel.name = body.name;
        if (body.is_active !== undefined) existChannel.is_active = body.is_active;
        if (body.isPrivate !== undefined) existChannel.isPrivate = body.isPrivate;
        existChannel.telegram_id = realTelegramId;
        existChannel.join_type = newJoinType;
        existChannel.invite_link = newInviteLink;
        existChannel.bot_permissions = status;

        await existChannel.save();
        await invalidateChannelsCache();
        return existChannel;
    },

    async deleteChannel(id) {
        const existChannel = await ChannelModel.findById(id)

        if (!existChannel) {
            const error = new Error("Kanal topilmadi!")
            error.status = 404
            throw error
        }

        await ChannelModel.deleteOne({ _id: id })
        await invalidateChannelsCache();
        return true
    }
}