import { Api } from "grammy";
import { BotModel } from "../models/bot.model.js";

export const BotService = {
    async saveToken(token, username) {
        if (!token) {
            const error = new Error("Bot tokeni topilmadi!");
            error.status = 400;
            throw error;
        }

        let botUsername = username;
        if (!botUsername) {
            try {
                const botApi = new Api(token);
                const me = await botApi.getMe();
                botUsername = me.username;
            } catch (e) {
                const error = new Error(`Telegram bot token yaroqsiz: ${e.message}`);
                error.status = 400;
                throw error;
            }
        }

        // Har doim yagona bot tokenini saqlaymiz (eski keraksiz tokenlarni o'chirib yangisini yozamiz)
        await BotModel.deleteMany({});
        const data = await BotModel.create({ token, username: botUsername });

        return { message: "Bot tokeni saqlandi!", data };
    },

    async getToken() {
        return await BotModel.find();
    }
};