import { authMiddleware } from "./auth.middleware.js";
import { botAuthMiddleware } from "./botAuth.middleware.js";

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
