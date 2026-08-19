/**
 * ============================================
 *  Kesh kalitlari — YAGONA MANBA (multibot)
 * ============================================
 *
 * Bu fayl bot repositoriysidagi `src/services/cache-keys.js` bilan
 * BIR XIL bo'lishi shart. Bot yozadi, backend o'chiradi — kalit nomlari
 * bir-biriga mos kelmasa, tahrirlangan film keshda eski holida qolib ketadi.
 *
 * MULTIBOT: barcha botlar BITTA Redis dan foydalanadi, shuning uchun har
 * kalit bot prefiksi bilan boshlanadi: `b8887969510:film:302`. Prefikssiz
 * bo'lsa 2-botning 302-kodli filmi 1-botnikini ustidan yozib yuborardi.
 *
 * Kalitlar ikki turga bo'linadi:
 *   1) Ma'lumot kalitlari — kod bo'yicha, bot ular orqali O(1) o'qiydi
 *   2) Nom indeksi       — `redis-cli KEYS "*"` chiqishida o'zbekcha nom
 *                          ko'rinib tursin uchun. Ichida faqat kod turadi.
 */

/** "Qutqaruv kuni" -> "qutqaruv-kuni" */
export const slugify = (text) =>
    String(text || "")
        .toLowerCase()
        .replace(/['’`]/g, "")
        .replace(/[^a-z0-9Ѐ-ӿ]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "nomsiz";

/**
 * Bitta bot uchun kalitlar to'plamini yasaydi.
 * @param {number|string} botId - Telegram bot ID
 */
export const createKeys = (botId) => {
    const p = `b${botId}`;

    return {
        // ── Ma'lumot kalitlari (bot shular orqali o'qiydi) ──
        film: (code) => `${p}:film:${code}`,
        episode: (code) => `${p}:episode:${code}`,
        filmsPage: (page) => `${p}:films:page:${page}`,
        search: (query) => `${p}:film:search:${String(query).toLowerCase().trim()}`,
        channels: () => `${p}:channels`,

        // ── Versiya belgisi ──
        // Har qanday film/epizod o'zgarishida backend buni INCR qiladi.
        // Sessiyalarda saqlangan ro'yxat nusxalari shu raqam bo'yicha eskirganini
        // biladi — har bir sessiyani alohida skanerlash shart emas (O(1)).
        version: () => `${p}:films:version`,

        // ── Nom indeksi (odam o'qishi uchun; qiymati — kod) ──
        filmName: (name) => `${p}:film:nom:${slugify(name)}`,
        episodeName: (name) => `${p}:episode:nom:${slugify(name)}`,

        // ── Bekor qilishda ishlatiladigan shablonlar ──
        patterns: {
            allFilmPages: `${p}:films:page:*`,
            allSearches: `${p}:film:search:*`,
        },
    };
};
