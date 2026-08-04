import { Api } from "grammy";
import { BotService } from "../services/bot.service.js";

let cachedApi = null;
let cachedForToken = null;

/**
 * Keshlangan bot tokenidan grammY Api obyektini qaytaradi.
 * Token o'zgarmaguncha bir xil Api instance qayta ishlatiladi.
 */
export const getBotApi = async () => {
    const token = await BotService.getTokenInternal();

    if (!token) {
        const error = new Error("Bot token topilmadi! Avval bot tokenini saqlang.");
        error.status = 404;
        throw error;
    }

    if (cachedApi && cachedForToken === token) {
        return cachedApi;
    }

    cachedApi = new Api(token);
    cachedForToken = token;
    return cachedApi;
};
