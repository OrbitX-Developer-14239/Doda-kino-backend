import mongoose from "mongoose";
import { Api } from "grammy";
import { CONFIG } from "../config/index.js";
import { CONNECTION_OPTIONS } from "../config/db.js";
import { createKeys } from "../utils/cache-keys.js";
import { FilmSearchIndex } from "../services/search-index.service.js";
import { FilmSchema } from "../models/film.model.js";
import { EpisodeSchema } from "../models/episode.model.js";
import { channelSchema } from "../models/channels.model.js";
import { userSchema } from "../models/user.model.js";
import { discoveredChatSchema } from "../models/discovered-chat.model.js";
import { logger } from "../utils/logger.js";

/**
 * ============================================
 *  Tenant registri — har bot uchun resurslar
 * ============================================
 *
 * Har bot IKKI clusterga ega (foydalanuvchi sxemasi bo'yicha):
 *   content cluster: films, episodes
 *   data cluster:    users, channels, discoveredchats
 *
 * Va har botning o'z: Telegram Api obyekti (o'z tokeni bilan), poster
 * kanali, Redis kalit prefiksi, xotiradagi qidiruv indeksi bor.
 *
 * Bironta botning clusteri ulanmasa server YIQILMAYDI — o'sha bot
 * "faol emas" deb belgilanadi va uning so'rovlariga 503 qaytadi,
 * qolgan botlar ishlashda davom etadi.
 */

const tenants = new Map();
let defaultTenantId = null;

const buildTenant = (botCfg) => {
    const { botId, token, contentUri, dataUri, contentDb, dataDb, channelId } = botCfg;

    const contentConn = mongoose.createConnection(contentUri, { ...CONNECTION_OPTIONS, dbName: contentDb });
    const dataConn = mongoose.createConnection(dataUri, { ...CONNECTION_OPTIONS, dbName: dataDb });

    const models = {
        Film: contentConn.model("Film", FilmSchema),
        Episode: contentConn.model("Episode", EpisodeSchema),
        Channel: dataConn.model("Channel", channelSchema),
        User: dataConn.model("User", userSchema),
        DiscoveredChat: dataConn.model("DiscoveredChat", discoveredChatSchema),
    };

    const tenant = {
        botId,
        token,
        channelId: channelId || null,
        // Kontent manbasining o'ziga xos belgisi. IKKI BOT bir xil belgiga
        // ega bo'lsa, ular AYNI film bazasidan o'qiydi ("Doda Kino" va
        // "Mega Filmlar" kabi). Kesh bekor qilishda shu belgi bo'yicha
        // guruhdoshlar ham tozalanadi.
        contentKey: `${contentUri}::${contentDb}`,
        contentConn,
        dataConn,
        models,
        keys: createKeys(botId),
        api: new Api(token),
        searchIndex: new FilmSearchIndex(botId, models.Film),
        // Ulanishlar tayyor bo'lganda true bo'ladi
        active: false,
        username: null,
    };

    return tenant;
};

/**
 * Barcha botlarning ulanishlarini ochadi. Muvaffaqiyatsizlari faol
 * bo'lmaydi, lekin jarayonni to'xtatmaydi.
 */
export const initTenants = async () => {
    for (const botCfg of CONFIG.BOTS) {
        tenants.set(String(botCfg.botId), buildTenant(botCfg));
    }

    // Birinchi sozlangan bot — "asosiy": eski /api/film ko'rinishidagi
    // yo'llar (admin panel) shu botga tushadi.
    defaultTenantId = String(CONFIG.BOTS[0].botId);

    await Promise.allSettled(
        [...tenants.values()].map(async (tenant) => {
            try {
                await Promise.all([
                    tenant.contentConn.asPromise(),
                    tenant.dataConn.asPromise(),
                ]);
                tenant.active = true;
                logger.info(
                    `[Tenant] Bot ${tenant.botId} ulandi: content=${tenant.contentConn.host}/${tenant.contentConn.name}, data=${tenant.dataConn.host}/${tenant.dataConn.name}`
                );
            } catch (error) {
                tenant.active = false;
                logger.error(
                    `[Tenant] Bot ${tenant.botId} ulanmadi (${error.message}) — bu bot 503 qaytaradi, qolganlari ishlaydi.`
                );
            }
        })
    );

    // Kontentni bo'lishayotgan botlarni loglaymiz — noto'g'ri sozlash
    // (masalan URI da xato) darhol ko'rinib tursin.
    const groups = new Map();
    for (const t of tenants.values()) {
        if (!groups.has(t.contentKey)) groups.set(t.contentKey, []);
        groups.get(t.contentKey).push(t.botId);
    }
    for (const ids of groups.values()) {
        if (ids.length > 1) {
            logger.info(`[Tenant] Bitta film bazasini bo'lishayotgan botlar: ${ids.join(", ")}`);
        }
    }

    return [...tenants.values()];
};

export const getTenant = (botId) => tenants.get(String(botId)) || null;

/**
 * Shu bot bilan BIR XIL film bazasidan o'qiydigan botlar (o'zi ham kiradi).
 *
 * Kesh bekor qilishda kerak: admin filmni tahrirlaganda faqat bitta botning
 * Redis kalitlari tozalansa, guruhdosh bot eskirgan ma'lumotni TTL tugagunicha
 * ko'rsatib turardi.
 */
export const contentSiblings = (tenant) => {
    if (!tenant?.contentKey) return tenant ? [tenant] : [];
    return [...tenants.values()].filter((t) => t.contentKey === tenant.contentKey);
};

export const getDefaultTenant = () =>
    defaultTenantId ? tenants.get(defaultTenantId) : null;

export const allTenants = () => [...tenants.values()];

export const closeTenants = async () => {
    await Promise.allSettled(
        [...tenants.values()].flatMap((t) => [
            t.contentConn.close(),
            t.dataConn.close(),
        ])
    );
};
