import crypto from "crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const message = (text) => ({ success: false, message: text });

const base = {
    standardHeaders: true,
    legacyHeaders: false,
};

const botTokenOf = (req) => req.headers["x-bot-token"] || req.headers["x-bot-secret"];

/**
 * Butun API uchun umumiy chegara.
 *
 * Telegram bot odatda backend bilan BIR XIL serverda turadi, ya'ni uning butun
 * trafigi bitta IP (127.0.0.1) dan keladi. Oddiy IP-chelak bilan bot minglab
 * foydalanuvchiga xizmat qilganda o'zini o'zi bo'g'ib qo'yardi.
 * Shuning uchun bot so'rovlari alohida, ancha kengroq chelakka ajratiladi.
 */
export const generalLimiter = rateLimit({
    ...base,
    windowMs: 60 * 1000,
    limit: (req) => (botTokenOf(req) ? 6000 : 300),
    keyGenerator: (req) => {
        const token = botTokenOf(req);
        if (token) {
            // Token o'zi kalit sifatida saqlanmaydi — faqat uning hash i
            return "bot:" + crypto.createHash("sha256").update(String(token)).digest("hex").slice(0, 32);
        }
        // ipKeyGenerator IP SATRINI oladi (req obyektini emas) va IPv6 ni to'g'ri normallashtiradi
        return ipKeyGenerator(req.ip);
    },
    message: message("Juda ko'p so'rov yuborildi. Biroz kuting."),
});

/** Login / token oqimlari — brute force ga qarshi qattiq chegara */
export const authLimiter = rateLimit({
    ...base,
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    message: message("Juda ko'p urinish. 15 daqiqadan so'ng qayta urinib ko'ring."),
});

/** AI qidiruvi — har so'rov pullik LLM chaqiruvini keltirib chiqaradi */
export const searchLimiter = rateLimit({
    ...base,
    windowMs: 60 * 1000,
    limit: 30,
    message: message("Qidiruv chegarasi oshdi. Biroz kuting."),
});

/** Fayl yuklash — diskni to'ldirishga qarshi */
export const uploadLimiter = rateLimit({
    ...base,
    windowMs: 60 * 60 * 1000,
    limit: 100,
    message: message("Yuklash chegarasi oshdi. Keyinroq urinib ko'ring."),
});
