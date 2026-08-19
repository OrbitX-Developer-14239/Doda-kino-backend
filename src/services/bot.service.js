import { BotModel } from "../models/bot.model.js";
import { currentTenant } from "../core/tenant-context.js";
import { allTenants, getDefaultTenant } from "../core/tenant-registry.js";
import { logger } from "../utils/logger.js";

/**
 * Botlar registri.
 *
 * Tokenlar .env da turadi va bazaga YOZILMAYDI. Bu servis faqat
 * "qaysi botlar bor" degan ma'lumotni yuritadi: server ishga tushganda
 * har bot Telegram dan o'z username ini oladi va MAIN clusterdagi
 * registrga yozib qo'yiladi (admin panel ro'yxati uchun).
 *
 * Eski oqim — bot har yonganda tokenini backendga POST qilishi —
 * OLIB TASHLANDI: endi backend botlarni o'zi biladi, tarmoq orqali
 * token yurmaydi.
 */
export const BotService = {
    /**
     * Ishga tushishda chaqiriladi: har faol botning username ini
     * Telegram dan olib registrga yozadi. Telegram javob bermasa ham
     * server ishlayveradi — username keyinroq to'ladi.
     */
    async syncRegistry() {
        for (const tenant of allTenants()) {
            if (!tenant.active) continue;
            try {
                const me = await tenant.api.getMe();
                tenant.username = me.username;
                await BotModel.updateOne(
                    { botId: tenant.botId },
                    { $set: { username: me.username } },
                    { upsert: true }
                );
                logger.info(`[Bot] Registr yangilandi: ${tenant.botId} @${me.username}`);
            } catch (error) {
                logger.warn(`[Bot] ${tenant.botId} uchun getMe ishlamadi: ${error.message}`);
                await BotModel.updateOne(
                    { botId: tenant.botId },
                    { $setOnInsert: { username: null } },
                    { upsert: true }
                ).catch(() => { });
            }
        }
    },

    /**
     * ASOSIY botning ma'lumoti — admin oqimlari (verify/login havolalari)
     * shu bot orqali ishlaydi. Eski nom ataylab saqlangan: admin.service
     * bir nechta joyda shu nom bilan chaqiradi.
     *
     * Admin yo'llari tenant kontekstidan TASHQARIDA ishlaydi (ular
     * tenantMiddleware dan oldin ulangan), shuning uchun bu yerda
     * currentTenant emas, default tenant ishlatiladi.
     */
    async getCachedBot() {
        const tenant = getDefaultTenant();
        if (!tenant) return null;

        if (!tenant.username && tenant.active) {
            try {
                const me = await tenant.api.getMe();
                tenant.username = me.username;
            } catch { /* Telegram javob bermasa keyinroq urinamiz */ }
        }

        if (!tenant.username) return null;
        return { botId: tenant.botId, username: tenant.username };
    },

    /** Joriy so'rov tegishli botning ochiq ma'lumoti */
    async getBotInfo() {
        const tenant = currentTenant();
        if (!tenant) return null;
        return {
            botId: tenant.botId,
            username: tenant.username,
            active: tenant.active,
        };
    },

    /** Barcha botlar ro'yxati (admin panel uchun) */
    async listBots() {
        return allTenants().map((t) => ({
            botId: t.botId,
            username: t.username,
            active: t.active,
        }));
    },
};
