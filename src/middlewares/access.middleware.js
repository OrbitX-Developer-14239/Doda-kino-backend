import { authMiddleware } from "./auth.middleware.js";
import { botAuthMiddleware } from "./botAuth.middleware.js";
import { BotService } from "../services/bot.service.js";
import { logger } from "../utils/logger.js";

/**
 * Ham Telegram bot, ham admin panel chaqiradigan endpointlar uchun.
 * `x-bot-token` header bo'lsa bot sifatida, aks holda admin JWT sifatida tekshiriladi.
 */
export const botOrAdmin = (roles = []) => {
    const admin = authMiddleware(roles);
    const bot = botAuthMiddleware();

    return (req, res, next) => {
        if (req.headers["x-bot-token"] || req.headers["x-bot-secret"]) {
            return bot(req, res, next);
        }
        return admin(req, res, next);
    };
};

/**
 * Bot o'zini ro'yxatdan o'tkazadigan endpoint uchun.
 *
 * Bazada bot yo'q bo'lsa — birinchi o'rnatish, ruxsat beriladi (aks holda bot hech qachon
 * o'zini yozolmaydi). Bot allaqachon yozilgan bo'lsa — amaldagi bot tokeni yoki
 * superadmin JWT talab qilinadi.
 */
export const botRegisterAuth = () => {
    const guarded = botOrAdmin(["superadmin"]);

    return async (req, res, next) => {
        try {
            const existing = await BotService.getCachedBot();

            if (!existing) {
                logger.warn("⚠️ [Bot] Bazada bot yo'q — /api/bot/save birinchi o'rnatish sifatida ochiq bajarildi.");
                return next();
            }

            return guarded(req, res, next);
        } catch (error) {
            next(error);
        }
    };
};
