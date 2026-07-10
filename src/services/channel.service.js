import { Api } from "grammy"
import { ChannelModel } from "../models/channels.model.js"
import { BotModel } from "../models/bot.model.js"

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