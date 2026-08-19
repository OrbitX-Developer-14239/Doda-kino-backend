import "dotenv/config"

const parseList = (value) =>
    String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

/**
 * Bot konfiguratsiyalari (multitenant).
 *
 * Har bot IKKI clusterga ega: content (films, episodes) va data (users,
 * channels, discovered chats). botId Telegram bot ID si — token boshidagi
 * raqam. Yangi bot qo'shish = .env ga TOKEN + 2 ta URI qo'shish.
 */
const parseBots = () => {
    const defs = [
        {
            token: process.env.BOT1_TOKEN,
            contentUri: process.env.MONGO_URI1,
            dataUri: process.env["MONGO_URI1.1"],
            channelId: process.env.CHANNEL_ID1 || process.env.CHANNEL_ID,
        },
        {
            token: process.env.BOT2_TOKEN,
            contentUri: process.env.MONGO_URI_BOT2,
            dataUri: process.env["MONGO_URI_BOT2.1"],
            channelId: process.env.CHANNEL_ID2,
        },
        {
            token: process.env.BOT3_TOKEN,
            contentUri: process.env.MONGO_URI_BOT3,
            dataUri: process.env["MONGO_URI_BOT3.1"],
            channelId: process.env.CHANNEL_ID3,
        },
    ];

    const bots = [];
    for (const [i, def] of defs.entries()) {
        // Token ham, URI lar ham bo'lmasa — bu o'rin ishlatilmayapti, jimgina o'tamiz
        if (!def.token && !def.contentUri && !def.dataUri) continue;

        if (!def.token || !def.contentUri || !def.dataUri) {
            console.warn(
                `[Config] ${i + 1}-bot chala sozlangan (token/contentUri/dataUri dan biri yo'q) — o'tkazib yuborildi.`
            );
            continue;
        }

        const botId = Number(def.token.split(":")[0]);
        if (!Number.isFinite(botId) || botId <= 0) {
            console.warn(`[Config] ${i + 1}-bot tokeni yaroqsiz ko'rinadi — o'tkazib yuborildi.`);
            continue;
        }

        // Atlas URI ichida to'ldirilmagan namuna qolib ketgan bo'lsa
        // (masalan "<db_username>") ulanish baribir yiqiladi — oldindan aytamiz.
        for (const uri of [def.contentUri, def.dataUri]) {
            if (/<[^>]+>/.test(uri)) {
                console.warn(
                    `[Config] ${i + 1}-bot (${botId}) URI sida to'ldirilmagan joy bor: "${uri.match(/<[^>]+>/)[0]}". Ulanish muvaffaqiyatsiz bo'ladi.`
                );
            }
        }

        bots.push({ botId, ...def });
    }
    return bots;
};

export const CONFIG = {
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: process.env.PORT || 5000,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    MONGO_URI_MAIN: process.env.MONGO_URI_MAIN,
    BOTS: parseBots(),
    ITEMS_PER_PAGE: 12,
    INSTAGRAM_ID: process.env.INSTAGRAM_ID,
    INSTAGRAM_TEMP_ACCESS_TOKEN: process.env.INSTAGRAM_TEMP_ACCESS_TOKEN,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN,
    SERVER_URL: process.env.SERVER_URL,
    CHANNEL_ID: process.env.CHANNEL_ID,

    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || "15m",
    REFRESH_TOKEN_TTL: process.env.REFRESH_TOKEN_TTL || "15d",

    SUPERADMIN_USERNAME: process.env.SUPERADMIN_USERNAME || "superadmin",
    SUPERADMIN_PASSWORD: process.env.SUPERADMIN_PASSWORD,

    // Bot bilan BIR XIL Redis bo'lishi shart — backend faqat kesh bekor qilish
    // uchun ulanadi. Berilmasa invalidatsiya jimgina o'chadi (server ishlayveradi).
    REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",

    ADMIN_PANEL_URL: process.env.ADMIN_PANEL_URL || "http://127.0.0.1:3000",
    CORS_ORIGINS: parseList(process.env.CORS_ORIGINS),

    // Ishlab chiqish uchun: istalgan localhost portidan (3000, 5173, ...) ruxsat beradi.
    // Panel tayyor bo'lgach o'chirib qo'yish kerak — pastdagi izohga qarang.
    CORS_ALLOW_LOCALHOST: process.env.CORS_ALLOW_LOCALHOST === "true",

    // Swagger production da faqat shu bayroq bilan ochiladi
    ENABLE_SWAGGER: process.env.ENABLE_SWAGGER === "true",
    SWAGGER_USER: process.env.SWAGGER_USER || "docs",
    SWAGGER_PASSWORD: process.env.SWAGGER_PASSWORD,

    // VAQTINCHA: true bo'lsa /api-docs login/parol so'ramaydi va butunlay ochiq
    // qoladi. Ishlatib bo'lgach .env dan olib tashlang.
    SWAGGER_NO_AUTH: process.env.SWAGGER_NO_AUTH === "true",
}

CONFIG.IS_PRODUCTION = CONFIG.NODE_ENV === "production";

const required = {
    MONGO_URI_MAIN: CONFIG.MONGO_URI_MAIN,
    JWT_SECRET: CONFIG.JWT_SECRET,
    JWT_REFRESH_SECRET: CONFIG.JWT_REFRESH_SECRET,
};

if (!CONFIG.BOTS.length) {
    throw new Error(
        "CRITICAL: birorta ham bot sozlanmagan. .env da kamida BOT1_TOKEN, " +
        "MONGO_URI1 va MONGO_URI1.1 bo'lishi kerak."
    );
}

const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

if (missing.length) {
    throw new Error(
        `CRITICAL: quyidagi environment o'zgaruvchilari yo'q: ${missing.join(", ")}. ` +
        `.env faylini to'ldiring (namuna uchun .env.example ga qarang).`
    );
}

if (CONFIG.JWT_SECRET === CONFIG.JWT_REFRESH_SECRET) {
    throw new Error("CRITICAL: JWT_SECRET va JWT_REFRESH_SECRET bir xil bo'lmasligi kerak!");
}

if (CONFIG.JWT_SECRET.length < 32 || CONFIG.JWT_REFRESH_SECRET.length < 32) {
    throw new Error("CRITICAL: JWT kalitlari kamida 32 belgidan iborat bo'lishi kerak!");
}

if (CONFIG.IS_PRODUCTION && !CONFIG.CORS_ORIGINS.length) {
    throw new Error("CRITICAL: production rejimida CORS_ORIGINS belgilanishi shart!");
}

if (CONFIG.IS_PRODUCTION && CONFIG.ENABLE_SWAGGER && !CONFIG.SWAGGER_PASSWORD) {
    throw new Error(
        "CRITICAL: production da ENABLE_SWAGGER=true bo'lsa SWAGGER_PASSWORD ham belgilanishi shart " +
        "(aks holda /api-docs butun API uchun ochiq konsolga aylanadi)."
    );
}
