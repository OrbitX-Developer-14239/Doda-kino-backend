import { Api } from "grammy";
import { BotModel } from "../models/bot.model.js";

const CACHE_TTL_MS = 30 * 1000;
let cachedBot = null;
let cachedAt = 0;

export const BotService = {
    /**
     * Bot hujjati deyarli o'zgarmaydi, lekin u har bot so'rovida kerak bo'ladi.
     * Qisqa TTL li kesh har chaqiriqdagi ortiqcha DB so'rovini olib tashlaydi.
     */
    async getCachedBot() {
        if (cachedBot && Date.now() - cachedAt < CACHE_TTL_MS) {
            return cachedBot;
        }

        cachedBot = await BotModel.findOne().lean();
        cachedAt = Date.now();
        return cachedBot;
    },

    invalidateCache() {
        cachedBot = null;
        cachedAt = 0;
    },

    async saveToken(token, username) {
        if (!token || typeof token !== "string") {
            const error = new Error("Bot tokeni topilmadi!");
            error.status = 400;
            throw error;
        }

        let botUsername = username;
        let botId = Number(token.split(":")[0]);
        if (!botUsername || isNaN(botId)) {
            try {
                const botApi = new Api(token);
                const me = await botApi.getMe();
                botUsername = me.username;
                botId = me.id;
            } catch (e) {
                const error = new Error(`Telegram bot token yaroqsiz: ${e.message}`);
                error.status = 400;
                throw error;
            }
        }

        // Har doim yagona bot tokenini saqlaymiz (eski keraksiz tokenlarni o'chirib yangisini yozamiz)
        await BotModel.deleteMany({});
        const data = await BotModel.create({ token, botId, username: botUsername });

        this.invalidateCache();

        // Token hech qachon javobda qaytarilmaydi
        return {
            message: "Bot tokeni saqlandi!",
            data: { _id: data._id, botId: data.botId, username: data.username }
        };
    },

    async getBotInfo() {
        const bot = await this.getCachedBot();
        if (!bot) {
            return null;
        }
        return {
            _id: bot._id,
            botId: bot.botId,
            username: bot.username
        };
    },

    /**
     * Ichki foydalanish uchun (Telegramga media yuborish va h.k.).
     * HTTP javobiga hech qachon chiqmasligi kerak.
     */
    async getTokenInternal() {
        const bot = await this.getCachedBot();
        return bot?.token || null;
    }
};
