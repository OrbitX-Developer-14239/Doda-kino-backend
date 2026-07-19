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

            const isAdmin = botMember.status === "administrator" || botMember.status === "creator";

            if (!isAdmin) {
                return {
                    is_admin: false,
                    status: botMember.status,
                    permissions: null,
                    message: "Bot ushbu kanal/guruhda admin emas!"
                };
            }

            const { status, user, ...permissions } = botMember;

            return {
                is_admin: true,
                ...permissions
            };
        } catch (err) {
            const error = new Error(`Telegram API xatoligi: ${err.message}`);
            error.status = 400;
            throw error;
        }
    },

    async createChannel(body) {
        const existChannel = await ChannelModel.findOne({ url: body.invite_link });

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

        const data = await ChannelModel.create({
            ...body,
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