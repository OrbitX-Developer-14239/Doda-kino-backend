import { Api } from "grammy"
import { ChannelModel } from "../models/channels.model.js"
import { BotModel } from "../models/bot.model.js"
import { UserModel } from "../models/user.model.js"

export const ChannelService = {
    async checkStatus(channelId) {
        const botToken = await BotModel.findOne();
        if (!botToken || !botToken.token) {
            const error = new Error("Bot token topilmadi!");
            error.status = 404;
            throw error;
        }

        const botApi = new Api(botToken.token);

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
        const botToken = await BotModel.findOne();
        if (!botToken || !botToken.token) {
            const error = new Error("Bot token topilmadi!");
            error.status = 404;
            throw error;
        }

        const botApi = new Api(botToken.token);
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
            bot_permissions: status
        });

        return data;
    },

    async getChannels() {
        const channels = await ChannelModel.find()

        return channels
    },

    async getChannelById(id) {
        const existChannel = await ChannelModel.findById(id);

        if (!existChannel) {
            const error = new Error("Kanal topilmadi!");
            error.status = 404;
            throw error;
        }

        const botToken = await BotModel.findOne();
        if (!botToken || !botToken.token) {
            const error = new Error("Bot token topilmadi!");
            error.status = 404;
            throw error;
        }

        const botApi = new Api(botToken.token);
        const channelTid = existChannel.telegram_id;

        let telegramMemberCount = 0;
        try {
            telegramMemberCount = await botApi.getChatMemberCount(channelTid);
        } catch (e) {
            console.error("Failed to get chat member count:", e.message);
        }

        const trackedUsers = await UserModel.find({
            "channels_condition.telegram_id": channelTid
        }).select("telegram_id");

        const SUBSCRIBED = ["member", "creator", "administrator"];
        let joinedActive = 0;
        let joinedLeft = 0;

        const checkPromises = trackedUsers.map(async (user) => {
            try {
                const member = await botApi.getChatMember(channelTid, Number(user.telegram_id));
                if (SUBSCRIBED.includes(member.status)) {
                    joinedActive++;
                } else {
                    joinedLeft++;
                }
            } catch (e) {
                joinedLeft++;
            }
        });

        await Promise.allSettled(checkPromises);

        return {
            ...existChannel.toObject(),
            statistics: {
                total_members: telegramMemberCount,
                joined_via_bot: joinedActive + joinedLeft,
                left_via_bot: joinedLeft
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
        existChannel.telegram_id = realTelegramId;
        existChannel.join_type = newJoinType;
        existChannel.invite_link = newInviteLink;
        existChannel.bot_permissions = status;

        await existChannel.save();
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
        return true
    }
}