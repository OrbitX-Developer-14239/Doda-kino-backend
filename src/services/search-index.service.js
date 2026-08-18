import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { FilmModel } from "../models/film.model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = path.resolve(__dirname, "../storage/search-index.json");

/**
 * ============================================
 *  Xotiradagi film qidiruv indeksi
 * ============================================
 *
 * NEGA BAZADAN EMAS:
 *   1) Atlas uzoqda (Singapur) — har qidiruv ~300 ms tarmoq safari.
 *      Xotirada bu ~0.1 ms.
 *   2) Bazadagi regex/`$text` o'zbekcha apostroflarni tushunmaydi.
 *      Bazada IKKI xil apostrof bor: "G'aroyib" (U+27) va "O‘rgimchak" (U+2018).
 *      Foydalanuvchi "orgimchak" deb yozsa hech narsa topilmasdi.
 *      Bu yerda normalizatsiyani o'zimiz boshqaramiz.
 *
 * Baza HAR DOIM haqiqat manbai bo'lib qoladi — indeks undan quriladi.
 * `storage/search-index.json` faqat tez ishga tushish uchun nusxa;
 * u bazadagi son bilan mos kelmasa e'tiborsiz qoldirilib qayta quriladi.
 */

/** "O‘rgimchak odam" -> "orgimchak odam" */
export const normalize = (text) =>
    String(text || "")
        .toLowerCase()
        // Barcha apostrof ko'rinishlari olib tashlanadi: ' ' ‘ ’ ` ʻ ʼ ´
        .replace(/['’‘`ʻʼ´]/g, "")
        // Harf va raqamdan boshqasi bo'sh joyga aylanadi
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");

const tokenize = (text) => normalize(text).split(" ").filter((w) => w.length >= 2);

// Qidiruvda ma'no bermaydigan so'zlar — ular bo'yicha moslik hisoblanmaydi
const STOP_WORDS = new Set([
    "film", "filmi", "kino", "kinosi", "serial", "seriali", "haqida",
    "the", "a", "an", "of", "and", "va", "yoki", "bir", "eng",
]);

let entries = [];      // { code, name, originalName, year, country, nName, nOriginal, words }
let ready = false;

// "koreys" -> "koreya" kabi keng tarqalgan shakllar. O'zbekchada to'liq
// morfologiya qilish og'ir, shuning uchun eng ko'p uchraydigan bir nechtasi.
const SYNONYMS = {
    koreys: "koreya", korea: "koreya", koreyscha: "koreya",
    rus: "rossiya", ruscha: "rossiya",
    turk: "turkiya", turkcha: "turkiya",
    amerika: "aqsh", amerikacha: "aqsh", usa: "aqsh",
    hind: "hindiston", hindcha: "hindiston",
    yapon: "yaponiya", xitoy: "xitoy",
};

const expand = (word) => SYNONYMS[word] || word;

const toEntry = (f) => {
    const nName = normalize(f.name);
    const nOriginal = normalize(f.originalName);

    // Nom so'zlari — asosiy moslik shu bo'yicha
    const nameWords = [...nName.split(" "), ...nOriginal.split(" ")]
        .filter((w) => w.length >= 2);

    // Tavsif, janr va davlat — "urush haqida ayollar filmi" kabi MAZMUNIY
    // so'rovlar uchun. Nomga qaraganda pastroq ball beriladi.
    const contextWords = [
        ...normalize(f.country).split(" "),
        ...normalize((f.genres || []).join(" ")).split(" "),
        ...normalize(f.description).split(" "),
    ].filter((w) => w.length >= 3);

    return {
        code: f.code,
        name: f.name,
        originalName: f.originalName,
        year: f.year,
        country: f.country || "",
        // Nusxaga yozish uchun saqlanadi (qidiruvda to'g'ridan-to'g'ri ishlatilmaydi)
        description: f.description || "",
        genres: f.genres || [],
        nName,
        nOriginal,
        words: new Set(nameWords),
        context: new Set(contextWords),
    };
};

export const SearchIndex = {
    get size() { return entries.length; },
    get isReady() { return ready; },

    /** Bazadan to'liq qayta quradi */
    async rebuild() {
        // description va genres ham kerak — mazmuniy qidiruv ("urush haqida
        // ayollar filmi") aynan shular bo'yicha ishlaydi.
        const films = await FilmModel.find()
            .select("code name originalName year country description genres")
            .lean();

        entries = films.map(toEntry);
        ready = true;

        await this._saveSnapshot().catch(() => { });
        return entries.length;
    },

    /**
     * Ishga tushishda: nusxadan o'qiydi, lekin bazadagi son bilan
     * solishtiradi — mos kelmasa qayta quradi (eskirgan nusxa ishlatilmaydi).
     */
    async init() {
        try {
            const [raw, dbCount] = await Promise.all([
                fs.readFile(SNAPSHOT, "utf8"),
                FilmModel.estimatedDocumentCount(),
            ]);
            const snap = JSON.parse(raw);

            if (Array.isArray(snap.films) && snap.films.length === dbCount) {
                entries = snap.films.map(toEntry);
                ready = true;
                return { source: "nusxa", count: entries.length };
            }
        } catch { /* nusxa yo'q yoki buzuq — bazadan quramiz */ }

        const count = await this.rebuild();
        return { source: "baza", count };
    },

    async _saveSnapshot() {
        const payload = {
            updatedAt: new Date().toISOString(),
            // Mazmuniy so'zlar ham saqlanadi, aks holda nusxadan tiklanganda
            // "urush haqida ayollar filmi" kabi so'rovlar ishlamay qolardi.
            films: entries.map((e) => ({
                code: e.code, name: e.name, originalName: e.originalName,
                year: e.year, country: e.country,
                description: e.description, genres: e.genres,
            })),
        };
        await fs.mkdir(path.dirname(SNAPSHOT), { recursive: true });
        await fs.writeFile(SNAPSHOT, JSON.stringify(payload));
    },

    // ── Sinxronlash (film o'zgarganda chaqiriladi) ──────────────────────────

    upsert(film) {
        if (!film?.code) return;
        const entry = toEntry(film);
        const i = entries.findIndex((e) => e.code === entry.code);
        if (i === -1) entries.push(entry); else entries[i] = entry;
        this._saveSnapshot().catch(() => { });
    },

    remove(code) {
        entries = entries.filter((e) => e.code !== Number(code));
        this._saveSnapshot().catch(() => { });
    },

    // ── Qidiruv ─────────────────────────────────────────────────────────────

    /**
     * Bitta so'rov bo'yicha qidiradi va ballab qaytaradi.
     * Ball: to'liq moslik > boshlanishi > barcha so'zlar > qism-satr > ba'zi so'zlar
     */
    search(query, limit = 12) {
        if (!ready) return [];

        const nQuery = normalize(query);
        if (nQuery.length < 2) return [];

        const qWords = tokenize(query).filter((w) => !STOP_WORDS.has(w));
        const scored = [];

        for (const e of entries) {
            let score = 0;

            if (e.nName === nQuery || e.nOriginal === nQuery) {
                score = 100;
            } else if (e.nName.startsWith(nQuery) || e.nOriginal.startsWith(nQuery)) {
                score = 80;
            } else if (nQuery.length >= 3 &&
                (e.nName.includes(nQuery) || e.nOriginal.includes(nQuery))) {
                score = 60;
            }

            if (qWords.length) {
                // Aniq so'z mosligi: "odam" so'rovi "Shimol odami" ga MOS KELMAYDI
                const exact = qWords.filter((w) => e.words.has(w)).length;
                if (exact) {
                    score = Math.max(score, exact === qWords.length
                        ? 55
                        : Math.round((exact / qWords.length) * 40));
                }

                // So'z BOSHIDAN moslik: "matematik" -> "Matematik mo'jizalar".
                // Ataylab `includes` emas — u "odam" ni "odami", "Shimol odami" ga
                // ham moslab, keraksiz natijalar berardi.
                for (const w of qWords) {
                    if (w.length < 5) continue;
                    const prefixHit = [...e.words].some((ew) => ew.startsWith(w) || w.startsWith(ew));
                    if (prefixHit) score = Math.max(score, 45);
                }

                // Mazmuniy moslik (tavsif/janr/davlat) — nomdan pastroq ball.
                // Ko'p so'z mos kelsa ishonch ortadi, bittasi tasodif bo'lishi mumkin.
                //
                // Prefiks bilan solishtiriladi, chunki o'zbekchada qo'shimchalar ko'p:
                // so'rovdagi "urush" tavsifdagi "urushining" ga mos kelishi kerak.
                const ctxHits = qWords.filter((w) => {
                    const target = expand(w);
                    if (e.context.has(target)) return true;
                    if (target.length < 4) return false;
                    for (const cw of e.context) {
                        if (cw.startsWith(target)) return true;
                    }
                    return false;
                }).length;
                if (ctxHits >= 2) score = Math.max(score, 30 + ctxHits * 3);
                else if (ctxHits === 1 && qWords.length === 1) score = Math.max(score, 25);
            }

            if (score > 0) scored.push({ e, score });
        }

        return scored
            .sort((a, b) => b.score - a.score || String(a.e.name).localeCompare(String(b.e.name)))
            .slice(0, limit)
            .map(({ e, score }) => ({
                code: e.code, name: e.name, originalName: e.originalName,
                year: e.year, _score: score,
            }));
    },

    /**
     * Bir nechta so'rov (masalan Groq qaytargan nomlar) bo'yicha, takrorsiz.
     *
     * `minScore` — Groq to'liq kino nomlarini beradi, shuning uchun undan
     * FAQAT kuchli moslik qabul qilinadi. Aks holda katalogda yo'q film
     * nomi ("Saving Private Ryan") tasodifan boshqa filmga yopishib qolardi.
     */
    searchMany(queries, limit = 12, minScore = 60) {
        const best = new Map();

        for (const q of queries) {
            for (const hit of this.search(q, limit)) {
                if (hit._score < minScore) continue;
                const prev = best.get(hit.code);
                if (!prev || hit._score > prev._score) best.set(hit.code, hit);
            }
        }

        return [...best.values()]
            .sort((a, b) => b._score - a._score)
            .slice(0, limit);
    },
};
