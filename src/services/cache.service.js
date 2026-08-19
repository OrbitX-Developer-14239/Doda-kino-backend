import { createClient } from "redis";
import { CONFIG } from "../config/index.js";
import { currentTenant } from "../core/tenant-context.js";

/**
 * ============================================
 *  Backend tomonidagi kesh BEKOR QILUVCHISI
 * ============================================
 *
 * Backend keshga YOZMAYDI — yozish bot vazifasi. Bu servis faqat
 * film/epizod o'zgarganda eskirgan yozuvlarni o'chiradi.
 *
 * Ilgari bunday mexanizm umuman yo'q edi: paneldan film tahrirlansa,
 * bot TTL tugagunicha (5 daqiqagacha) eski ma'lumotni ko'rsatib turardi.
 *
 * Redis o'chiq bo'lsa ham hech narsa yiqilmaydi — barcha amallar
 * jimgina o'tkazib yuboriladi (kesh o'zi TTL bilan yangilanadi).
 */
class CacheService {
    constructor() {
        this.client = null;
        this.isReady = false;
    }

    async connect() {
        if (!CONFIG.REDIS_URL) {
            console.warn("[Cache] REDIS_URL yo'q — kesh bekor qilish o'chirilgan");
            return;
        }

        try {
            this.client = createClient({
                url: CONFIG.REDIS_URL,
                socket: {
                    reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
                    connectTimeout: 3000,
                },
            });

            this.client.on("error", (err) => {
                if (this.isReady) console.error("[Cache] Redis xatosi:", err.message);
                this.isReady = false;
            });
            this.client.on("ready", () => {
                console.log("[Cache] Redis ulandi ✅");
                this.isReady = true;
            });
            this.client.on("end", () => { this.isReady = false; });

            // Redis kutilmasa ham server ishga tushaveradi
            await Promise.race([
                this.client.connect(),
                new Promise((resolve) => setTimeout(resolve, 4000)),
            ]);
        } catch (error) {
            console.warn("[Cache] Redis ulanmadi — keshsiz davom etadi:", error.message);
            this.isReady = false;
        }
    }

    async disconnect() {
        try {
            if (this.client?.isOpen) await this.client.quit();
        } catch { /* yopilishda xato muhim emas */ }
        this.isReady = false;
    }

    async del(keys) {
        const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
        if (!this.isReady || !this.client || !list.length) return 0;
        try {
            return await this.client.del(list);
        } catch (error) {
            console.error("[Cache] DEL xatosi:", error.message);
            return 0;
        }
    }

    /** SCAN bilan — KEYS Redis'ni bloklaydi, katta bazada ishlatib bo'lmaydi */
    async delByPattern(pattern) {
        if (!this.isReady || !this.client) return 0;
        let removed = 0;
        try {
            for await (const chunk of this.client.scanIterator({ MATCH: pattern, COUNT: 200 })) {
                const batch = Array.isArray(chunk) ? chunk : [chunk];
                if (batch.length) removed += await this.client.del(batch);
            }
        } catch (error) {
            console.error("[Cache] DEL pattern xatosi:", error.message);
        }
        return removed;
    }

    /**
     * Versiya belgisini oshiradi.
     *
     * Bot foydalanuvchi sessiyasida film ro'yxatining NUSXASINI saqlaydi
     * (sahifalash uchun). Ularni bittalab tozalash uchun minglab sessiyani
     * skanerlash kerak bo'lardi — buning o'rniga bitta hisoblagich oshiriladi,
     * bot esa nusxasi eskirganini shu raqamdan biladi.
     */
    /**
     * Joriy so'rov qaysi botga tegishli bo'lsa, o'sha botning kalitlari.
     * Tenant konteksti bo'lmasa (masalan skriptdan chaqirilsa) null —
     * invalidatsiya jimgina o'tkazib yuboriladi, server yiqilmaydi.
     */
    _keys() {
        const keys = currentTenant()?.keys;
        if (!keys) console.warn("[Cache] Tenant konteksti yo'q — invalidatsiya o'tkazib yuborildi");
        return keys || null;
    }

    async bumpVersion() {
        if (!this.isReady || !this.client) return;
        const keys = this._keys();
        if (!keys) return;
        try {
            await this.client.incr(keys.version());
        } catch (error) {
            console.error("[Cache] Versiya oshirishda xato:", error.message);
        }
    }

    // ── Yuqori darajali bekor qilish ────────────────────────────────────────

    /**
     * Film o'zgardi/o'chirildi.
     * @param {object} film  - o'zgarishdan OLDINGI holat (eski kod/nom uchun)
     * @param {object} [next] - yangi holat (kod yoki nom o'zgargan bo'lsa)
     */
    async invalidateFilm(film, next = null) {
        if (!film && !next) return;
        const K = this._keys();
        if (!K) return;

        const keys = new Set();
        for (const f of [film, next].filter(Boolean)) {
            if (f.code !== undefined && f.code !== null) keys.add(K.film(f.code));
            if (f.name) keys.add(K.filmName(f.name));
            // Filmning ichki `episodes` nusxasi ham o'zgargan bo'lishi mumkin
            for (const ep of f.episodes || []) {
                if (ep?.code !== undefined) keys.add(K.episode(ep.code));
                if (ep?.name) keys.add(K.episodeName(ep.name));
            }
        }

        await this.del([...keys]);
        // Ro'yxat va qidiruv natijalari ham eskirdi
        await this.delByPattern(K.patterns.allFilmPages);
        await this.delByPattern(K.patterns.allSearches);
        await this.bumpVersion();
    }

    /**
     * Epizod o'zgardi/o'chirildi. Film keshi ham eskiradi, chunki
     * film hujjati ichida qismlar nusxasi va episodesCount saqlanadi.
     */
    async invalidateEpisode(episode, next = null, filmCode = null, filmName = null) {
        const K = this._keys();
        if (!K) return;

        const keys = new Set();
        for (const e of [episode, next].filter(Boolean)) {
            if (e.code !== undefined && e.code !== null) keys.add(K.episode(e.code));
            if (e.name) keys.add(K.episodeName(e.name));
        }
        if (filmCode !== null && filmCode !== undefined) keys.add(K.film(filmCode));
        if (filmName) keys.add(K.filmName(filmName));

        await this.del([...keys]);
        await this.delByPattern(K.patterns.allFilmPages);
        await this.delByPattern(K.patterns.allSearches);
        await this.bumpVersion();
    }
}

export const cache = new CacheService();
