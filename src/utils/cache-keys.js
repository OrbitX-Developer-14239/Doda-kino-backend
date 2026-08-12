/**
 * ============================================
 *  Kesh kalitlari — YAGONA MANBA
 * ============================================
 *
 * Bu fayl bot repositoriysidagi `src/services/cache-keys.js` bilan
 * BIR XIL bo'lishi shart. Bot yozadi, backend o'chiradi — kalit nomlari
 * bir-biriga mos kelmasa, tahrirlangan film keshda eski holida qolib ketadi.
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

export const KEYS = {
    // ── Ma'lumot kalitlari (bot shular orqali o'qiydi) ──
    film: (code) => `film:${code}`,
    episode: (code) => `episode:${code}`,
    filmsPage: (page) => `films:page:${page}`,
    search: (query) => `film:search:${String(query).toLowerCase().trim()}`,
    channels: () => `channels`,

    // ── Versiya belgisi ──
    // Har qanday film/epizod o'zgarishida backend buni INCR qiladi.
    // Sessiyalarda saqlangan ro'yxat nusxalari shu raqam bo'yicha eskirganini
    // biladi — har bir sessiyani alohida skanerlash shart emas (O(1)).
    version: () => `films:version`,

    // ── Nom indeksi (odam o'qishi uchun; qiymati — kod) ──
    filmName: (name) => `film:nom:${slugify(name)}`,
    episodeName: (name) => `episode:nom:${slugify(name)}`,
};

/** Bekor qilishda ishlatiladigan shablonlar */
export const PATTERNS = {
    allFilmPages: "films:page:*",
    allSearches: "film:search:*",
};
