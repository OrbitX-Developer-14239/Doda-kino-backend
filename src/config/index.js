import "dotenv/config"

export const CONFIG = {
    PORT: process.env.PORT || 5000,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    MONGO_URI1: process.env.MONGO_URI1,
    MONGO_URI2: process.env.MONGO_URI2,
    ITEMS_PER_PAGE: 12,
    INSTAGRAM_ID: process.env.INSTAGRAM_ID,
    INSTAGRAM_TEMP_ACCESS_TOKEN: process.env.INSTAGRAM_TEMP_ACCESS_TOKEN,
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN,
    SERVER_URL: process.env.SERVER_URL,
    CHANNEL_ID: process.env.CHANNEL_ID
}

if (!CONFIG.MONGO_URI1 || !CONFIG.MONGO_URI2) {
    throw new Error("CRITICAL: MONGO_URI1 or MONGO_URI2 is missing in environment variables!");
}
