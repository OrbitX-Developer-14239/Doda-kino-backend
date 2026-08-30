import crypto from "crypto";
import { authMiddleware } from "./auth.middleware.js";
import { CONFIG } from "../config/index.js";

/** Vaqt bo'yicha barqaror solishtirish (token uzunligi sizib chiqmasin) */
const safeEqual = (a, b) => {
    const bufA = crypto.createHash("sha256").update(String(a)).digest();
    const bufB = crypto.createHash("sha256").update(String(b)).digest();
    return crypto.timingSafeEqual(bufA, bufB);
};
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

/**
 * Botga BOG'LIQ BO'LMAGAN, lekin bot chaqiradigan yo'llar uchun
 * (masalan reklama tarqatish — u bir nechta botni qamraydi).
 *
 * `botOrAdmin` dan farqi: u URL dagi tenant bilan solishtiradi, bu esa
 * tokenni SOZLANGAN BARCHA botlar bilan solishtiradi. Shu sababli
 * tenant middleware ishlamaydigan global yo'llarda ham ishlaydi.
 */
export const anyBotOrAdmin = (roles = []) => {
    const admin = authMiddleware(roles);

    return (req, res, next) => {
        const token = req.headers["x-bot-token"] || req.headers["x-bot-secret"];
        if (!token) return admin(req, res, next);

        const match = CONFIG.BOTS.find((b) => safeEqual(b.token, token));
        if (!match) {
            return res.status(403).json({ success: false, message: "Ushbu botga ruxsat yo'q" });
        }

        req.bot = { botId: match.botId };
        next();
    };
};
