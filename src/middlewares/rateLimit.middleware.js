import rateLimit from "express-rate-limit";

const message = (text) => ({ success: false, message: text });

const base = {
    standardHeaders: true,
    legacyHeaders: false,
};

/** Butun API uchun umumiy chegara */
export const generalLimiter = rateLimit({
    ...base,
    windowMs: 60 * 1000,
    limit: 300,
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
