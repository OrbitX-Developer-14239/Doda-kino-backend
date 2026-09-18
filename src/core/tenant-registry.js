import mongoose from "mongoose";
import { Api } from "grammy";
import { CONFIG } from "../config/index.js";
import { CONNECTION_OPTIONS } from "../config/db.js";
import { createKeys } from "../utils/cache-keys.js";
import { FilmSearchIndex, setIndexSiblingsResolver } from "../services/search-index.service.js";
import { FilmSchema } from "../models/film.model.js";
import { EpisodeSchema } from "../models/episode.model.js";
import { channelSchema } from "../models/channels.model.js";
import { userSchema } from "../models/user.model.js";
import { discoveredChatSchema } from "../models/discovered-chat.model.js";
import { viewStatSchema } from "../models/view-stat.model.js";
import { channelEventSchema } from "../models/channel-event.model.js";
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
 * IKKI XIL BOT BOR:
 *   1) ODDIY   — o'z film bazasi bor, unga yozadi ham, o'qiydi ham.
 *   2) ARALASH — o'z film bazasi YO'Q. Kontentni bir nechta boshqa botning
 *      bazasidan birlashtirib, faqat O'QIYDI (.env dagi BOT<n>_CONTENT_FROM).
 *      Foydalanuvchilari esa har doimgidek o'zinikida.
 *
 * Bironta botning clusteri ulanmasa server YIQILMAYDI — o'sha bot
 * "faol emas" deb belgilanadi va uning so'rovlariga 503 qaytadi,
 * qolgan botlar ishlashda davom etadi.
 */

const tenants = new Map();

/**
 * Kontent do'konlari — URI + baza nomi bo'yicha YAGONA nusxada.
 *
 * Ilgari har bot o'ziga alohida ulanish ochardi: "Doda Kino" va "Mega
 * Filmlar" bir xil bazaga ikkita ulanish yasardi. Endi bitta do'kon
 * bo'lishiladi — ulanishlar soni kamayadi (Atlas bepul tarifida bu
 * cheklangan resurs) va aralash bot mavjud do'konlarni qayta ishlatadi.
 */
const contentStores = new Map();

let defaultTenantId = null;

/** contentKey -> o'sha kod maydonidagi barcha contentKey lar */
let codeSpaces = new Map();

const storeKey = (uri, dbName) => `${uri}::${dbName}`;

const getOrCreateStore = (uri, dbName) => {
    const key = storeKey(uri, dbName);
    let store = contentStores.get(key);
    if (!store) {
        const conn = mongoose.createConnection(uri, { ...CONNECTION_OPTIONS, dbName });
        store = {
            key,
            conn,
            Film: conn.model("Film", FilmSchema),
            Episode: conn.model("Episode", EpisodeSchema),
        };
        contentStores.set(key, store);
    }
    return store;
};

/**
 * Aralash botning Film/Episode modeli o'rniga qo'yiladigan qo'riqchi.
 *
 * Bunday botda yoziladigan film bazasi YO'Q, o'qish esa content-merge.js
 * orqali manbalar ustidan boradi. Shu sababli modelga to'g'ridan-to'g'ri
 * murojaat qilish — o'tkazib yuborilgan yo'l yoki panel orqali yozishga
 * urinish degani. Jimgina noto'g'ri bazaga tegishdan ko'ra aniq xato yaxshi.
 */
const readOnlyContentGuard = (name, botId) =>
    new Proxy(Object.create(null), {
        get(_, prop) {
            throw Object.assign(
                new Error(
                    `Bot ${botId} — ARALASH bot: o'z ${name} bazasi yo'q, kontentni ` +
                    `boshqa botlarnikidan faqat o'qiydi. "${String(prop)}" bu bot uchun mumkin emas.`
                ),
                { status: 400 }
            );
        },
    });

const baseTenant = (botCfg) => ({
    slot: botCfg.slot,
    botId: botCfg.botId,
    token: botCfg.token,
    channelId: botCfg.channelId || null,
    keys: createKeys(botCfg.botId),
    api: new Api(botCfg.token),
    active: false,
    username: null,
});

/** Oddiy bot: o'z film bazasi bor */
const buildSimpleTenant = (botCfg) => {
    const { botId, contentUri, dataUri, contentDb, dataDb } = botCfg;

    const store = getOrCreateStore(contentUri, contentDb);
    const dataConn = mongoose.createConnection(dataUri, { ...CONNECTION_OPTIONS, dbName: dataDb });

    const models = {
        Film: store.Film,
        Episode: store.Episode,
        Channel: dataConn.model("Channel", channelSchema),
        User: dataConn.model("User", userSchema),
        DiscoveredChat: dataConn.model("DiscoveredChat", discoveredChatSchema),
        // Statistika: kunlik ko'rishlar va kanal hodisalari — har botda o'zinikí
        ViewStat: dataConn.model("ViewStat", viewStatSchema),
        ChannelEvent: dataConn.model("ChannelEvent", channelEventSchema),
    };

    return {
        ...baseTenant(botCfg),
        content: {
            stores: [store],
            keys: [store.key],
            readOnly: false,
            primary: store,          // yozish shu do'konga boradi
        },
        // Eski nomlar — loglar va skriptlar shularni kutadi
        contentKey: store.key,
        contentConn: store.conn,
        dataConn,
        models,
        searchIndex: new FilmSearchIndex(botId, [store.Film]),
    };
};

/** Aralash bot: kontent bir nechta manbadan, faqat o'qish uchun */
const buildCompositeTenant = (botCfg, sourceTenants) => {
    const { botId, dataUri, dataDb } = botCfg;

    // Bir manba ikki marta ko'rsatilgan bo'lsa ham do'kon bitta bo'ladi
    const stores = [];
    for (const src of sourceTenants) {
        for (const store of src.content.stores) {
            if (!stores.some((s) => s.key === store.key)) stores.push(store);
        }
    }

    const dataConn = mongoose.createConnection(dataUri, { ...CONNECTION_OPTIONS, dbName: dataDb });

    const models = {
        Film: readOnlyContentGuard("film", botId),
        Episode: readOnlyContentGuard("qism", botId),
        Channel: dataConn.model("Channel", channelSchema),
        User: dataConn.model("User", userSchema),
        DiscoveredChat: dataConn.model("DiscoveredChat", discoveredChatSchema),
        // Statistika: kunlik ko'rishlar va kanal hodisalari — har botda o'zinikí
        ViewStat: dataConn.model("ViewStat", viewStatSchema),
        ChannelEvent: dataConn.model("ChannelEvent", channelEventSchema),
    };

    return {
        ...baseTenant(botCfg),
        content: {
            stores,
            keys: stores.map((s) => s.key),
            readOnly: true,
            primary: null,
        },
        contentKey: `merge(${stores.map((s) => s.key).sort().join(" + ")})`,
        contentConn: stores[0]?.conn || null,
        dataConn,
        models,
        searchIndex: new FilmSearchIndex(botId, stores.map((s) => s.Film)),
        sourceBotIds: sourceTenants.map((t) => t.botId),
    };
};

/**
 * KOD MAYDONLARI.
 *
 * Kod (masalan 90500) foydalanuvchiga ko'rinadi — u botga shu raqamni
 * yozadi. Aralash bot ikki bazani birlashtirgani uchun o'sha ikki bazada
 * BIR XIL kod bo'lsa, qaysi biri kerakligini aniqlab bo'lmaydi.
 *
 * Shuning uchun aralash bot birlashtirgan bazalar bitta "kod maydoni"ga
 * qo'shiladi va yangi kod tanlanganda maydondagi HAMMA baza hisobga
 * olinadi. Quyida bu union-find bilan hisoblanadi: bir necha aralash bot
 * bazalarni zanjir qilib bog'lasa ham to'g'ri ishlaydi.
 */
const computeCodeSpaces = () => {
    const parent = new Map();
    const find = (x) => {
        while (parent.get(x) !== x) {
            parent.set(x, parent.get(parent.get(x)));
            x = parent.get(x);
        }
        return x;
    };
    const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    };

    for (const key of contentStores.keys()) parent.set(key, key);

    for (const tenant of tenants.values()) {
        const keys = tenant.content.keys;
        for (let i = 1; i < keys.length; i++) union(keys[0], keys[i]);
    }

    codeSpaces = new Map();
    for (const key of contentStores.keys()) {
        const root = find(key);
        if (!codeSpaces.has(root)) codeSpaces.set(root, new Set());
        codeSpaces.get(root).add(key);
    }
};

/**
 * Barcha botlarning ulanishlarini ochadi. Muvaffaqiyatsizlari faol
 * bo'lmaydi, lekin jarayonni to'xtatmaydi.
 */
export const initTenants = async () => {
    const simple = CONFIG.BOTS.filter((b) => !b.contentFrom?.length);
    const composite = CONFIG.BOTS.filter((b) => b.contentFrom?.length);

    for (const botCfg of simple) {
        tenants.set(String(botCfg.botId), buildSimpleTenant(botCfg));
    }

    // Aralash botlar manbalarga tayanadi — shuning uchun IKKINCHI bosqichda
    const bySlot = new Map(CONFIG.BOTS.map((b) => [b.slot, b]));
    for (const botCfg of composite) {
        const sources = botCfg.contentFrom
            .map((slot) => bySlot.get(slot))
            .filter(Boolean)
            .map((cfg) => tenants.get(String(cfg.botId)))
            .filter((t) => t && !t.content.readOnly);

        if (!sources.length) {
            logger.error(
                `[Tenant] Bot ${botCfg.botId} uchun kontent manbalari topilmadi ` +
                `(BOT${botCfg.slot}_CONTENT_FROM=${botCfg.contentFrom.join(",")}) — bot o'tkazib yuborildi.`
            );
            continue;
        }

        tenants.set(String(botCfg.botId), buildCompositeTenant(botCfg, sources));
    }

    // Birinchi sozlangan bot — "asosiy": eski /api/film ko'rinishidagi
    // yo'llar (admin panel) shu botga tushadi.
    const first = CONFIG.BOTS.find((b) => tenants.has(String(b.botId)));
    defaultTenantId = first ? String(first.botId) : null;

    computeCodeSpaces();

    // Film tahrirlanganda indeks yangilanishi kimga tarqalishini
    // qidiruv xizmati shu funksiya orqali biladi.
    setIndexSiblingsResolver(contentSiblings);

    await Promise.allSettled(
        [...tenants.values()].map(async (tenant) => {
            try {
                await Promise.all([
                    ...tenant.content.stores.map((s) => s.conn.asPromise()),
                    tenant.dataConn.asPromise(),
                ]);
                tenant.active = true;
                const contentInfo = tenant.content.stores
                    .map((s) => `${s.conn.host}/${s.conn.name}`)
                    .join(" + ");
                logger.verbose(
                    `[Tenant] Bot ${tenant.botId} ulandi: content=${contentInfo}, data=${tenant.dataConn.host}/${tenant.dataConn.name}`
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
        if (t.content.readOnly) continue;
        if (!groups.has(t.contentKey)) groups.set(t.contentKey, []);
        groups.get(t.contentKey).push(t.botId);
    }
    for (const ids of groups.values()) {
        if (ids.length > 1) {
            logger.verbose(`[Tenant] Bitta film bazasini bo'lishayotgan botlar: ${ids.join(", ")}`);
        }
    }
    for (const t of tenants.values()) {
        if (!t.content.readOnly) continue;
        logger.verbose(
            `[Tenant] Bot ${t.botId} — ARALASH: kontent ${t.sourceBotIds.join(" + ")} botlarnikidan o'qiladi (yozish yo'q)`
        );
    }

    return [...tenants.values()];
};

export const getTenant = (botId) => tenants.get(String(botId)) || null;

/**
 * Shu bot bilan BIR XIL kontentga tegadigan botlar (o'zi ham kiradi).
 *
 * Kesh bekor qilishda va qidiruv indeksini yangilashda kerak: admin filmni
 * tahrirlaganda faqat bitta botning nusxalari tozalansa, o'sha filmni
 * ko'rsatayotgan boshqa bot (bazani bo'lishadigan yoki ARALASH bot)
 * eskirgan ma'lumotni TTL tugagunicha ko'rsatib turardi.
 */
export const contentSiblings = (tenant) => {
    if (!tenant?.content?.keys?.length) return tenant ? [tenant] : [];
    const mine = new Set(tenant.content.keys);
    return [...tenants.values()].filter((t) => t.content.keys.some((k) => mine.has(k)));
};

/**
 * Joriy tenant bilan BITTA kod maydonini bo'lishadigan barcha kontent
 * do'konlari. Yangi kod tanlashda va kod bandligini tekshirishda kerak.
 */
export const codeSpaceStores = (tenant) => {
    const first = tenant?.content?.keys?.[0];
    if (!first) return [];
    for (const set of codeSpaces.values()) {
        if (set.has(first)) {
            return [...set].map((k) => contentStores.get(k)).filter(Boolean);
        }
    }
    return tenant.content.stores;
};

export const getDefaultTenant = () =>
    defaultTenantId ? tenants.get(defaultTenantId) : null;

export const allTenants = () => [...tenants.values()];

export const closeTenants = async () => {
    await Promise.allSettled([
        ...[...contentStores.values()].map((s) => s.conn.close()),
        ...[...tenants.values()].map((t) => t.dataConn.close()),
    ]);
};
