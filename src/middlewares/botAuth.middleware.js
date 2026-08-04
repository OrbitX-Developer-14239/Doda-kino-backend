import crypto from "crypto";
import { BotService } from "../services/bot.service.js";

/**
 * Ikkita matnni uzunlik sizib chiqmaydigan va vaqt bo'yicha barqaror tarzda solishtiradi.
 */
const safeEqual = (a, b) => {
    const bufA = crypto.createHash("sha256").update(String(a)).digest();
    const bufB = crypto.createHash("sha256").update(String(b)).digest();
    return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Telegram bot yuboradigan so'rovlarni tekshiradi.
 * Sir faqat HTTP header orqali qabul qilinadi — query string access loglarga tushadi.
 */
export const botAuthMiddleware = () => {
    return async (req, res, next) => {
        const botToken = req.headers["x-bot-token"] || req.headers["x-bot-secret"];

        if (!botToken) {
            return res.status(401).json({ success: false, message: "Bot tokeni yuborilmagan!" });
        }

        try {
            const bot = await BotService.getCachedBot();

            if (!bot || !bot.token || !safeEqual(bot.token, botToken)) {
                return res.status(403).json({ success: false, message: "Ushbu botga ruxsat yo'q" });
            }

            req.bot = { botId: bot.botId, username: bot.username };
            next();
        } catch (error) {
            next(error);
        }
    };
};
