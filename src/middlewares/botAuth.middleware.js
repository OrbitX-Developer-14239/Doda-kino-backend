import crypto from "crypto";
import { currentTenant } from "../core/tenant-context.js";

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
 *
 * MULTIBOT: header dagi token URL da ko'rsatilgan botning (tenant)
 * .env dagi tokeniga AYNAN mos kelishi shart. Shu tekshiruv tufayli
 * bir bot boshqa botning ID si bilan so'rov yubora olmaydi —
 * token mos kelmasa 403.
 *
 * Sir faqat HTTP header orqali qabul qilinadi — query string access
 * loglarga tushadi.
 */
export const botAuthMiddleware = () => {
    return (req, res, next) => {
        const botToken = req.headers["x-bot-token"] || req.headers["x-bot-secret"];

        if (!botToken) {
            return res.status(401).json({ success: false, message: "Bot tokeni yuborilmagan!" });
        }

        const tenant = currentTenant();
        if (!tenant?.token) {
            return res.status(503).json({ success: false, message: "Bot sozlanmagan" });
        }

        if (!safeEqual(tenant.token, botToken)) {
            return res.status(403).json({ success: false, message: "Ushbu botga ruxsat yo'q" });
        }

        req.bot = { botId: tenant.botId, username: tenant.username };
        next();
    };
};
