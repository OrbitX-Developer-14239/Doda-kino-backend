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
 * FAQAT NOM bo'yicha qidiradi (name + originalName). Tavsif, janr va davlat
 * ATAYLAB indeksga kiritilmaydi: sinovlar ko'rsatdiki, tavsif so'zlari
 * bo'yicha moslik uzun tasviriy so'rovlarda aloqasiz filmlarni qaytaradi
 * ("superqahramon" tasviriga 12 ta begona film chiqqan edi). Tasviriy
 * so'rovlarni Groq nomga aylantiradi, keyin o'sha nomlar shu yerdan qidiriladi.
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

// Qidiruvda ma'no bermaydigan so'zlar — ular bo'yicha moslik hisoblanmaydi.
// "matematik haqida film" -> faqat "matematik" nomlardan qidiriladi.
const STOP_WORDS = new Set([
    "film", "filmi", "kino", "kinosi", "serial", "seriali", "haqida",
    "the", "a", "an", "of", "and", "va", "yoki", "bir", "eng",
]);

let entries = [];      // { code, name, originalName, year, nName, nOriginal, words }
let ready = false;

const toEntry = (f) => {
    const nName = normalize(f.name);
    const nOriginal = normalize(f.originalName);

    const nameWords = [...nName.split(" "), ...nOriginal.split(" ")]
        .filter((w) => w.length >= 2);

    return {
        code: f.code,
        name: f.name,
        originalName: f.originalName,
        year: f.year,
        nName,
        nOriginal,
        words: new Set(nameWords),
    };
};

export const SearchIndex = {
    get size() { return entries.length; },
    get isReady() { return ready; },

    /** Bazadan to'liq qayta quradi */
    async rebuild() {
        const films = await FilmModel.find()
            .select("code name originalName year")
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
            films: entries.map((e) => ({
                code: e.code, name: e.name, originalName: e.originalName,
                year: e.year,
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
     * Bitta so'rov bo'yicha NOMLARDAN qidiradi va ballab qaytaradi.
     * Ball: to'liq moslik > boshlanishi > qism-satr > so'z qamrovi
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
                // So'rovdagi qaysi so'zlar film NOMIDA bor?
                // Aniq moslik: "odam" so'rovi "Shimol odami" ga MOS KELMAYDI.
                // Prefiks moslik: "matematik" -> "Matematik mo'jizalar".
                // Ataylab `includes` emas — u "odam" ni "odami" ga ham moslab,
                // keraksiz natijalar berardi.
                let nameHits = 0;
                for (const w of qWords) {
                    if (e.words.has(w)) { nameHits++; continue; }
                    // Prefiks moslik o'zbekcha qo'shimchalar uchun:
                    // "matematik" <-> "matematikaning".
                    //
                    // IKKALA so'z ham uzun bo'lishi SHART. Aks holda nomdagi
                    // qisqa so'z ("In Our Prime" dagi "in") istalgan uzun
                    // so'rovga yopishardi: "Interstellar" so'rovi "in" orqali
                    // "Matematik mo'jizalar" va "Alice in Wonderland" ni ham
                    // qaytarardi.
                    if (w.length < 5) continue;
                    for (const ew of e.words) {
                        if (ew.length < 5) continue;
                        if (ew.startsWith(w) || w.startsWith(ew)) { nameHits++; break; }
                    }
                }

                // QAMROV muhim, mutlaq son emas.
                //
                // 12 so'zli tasvirda bitta "hujum" so'zi "Titanlar hujumi" ga
                // mos kelgani film TOPILDI degani emas — qamrov past bo'lsa
                // moslik hisoblanmaydi va so'rov Groq'ga o'tadi.
                if (nameHits) {
                    const coverage = nameHits / qWords.length;
                    if (coverage === 1) {
                        // TO'LIQ qamrov = kuchli moslik, qism-satrdan ham ishonchli.
                        // 70 ball ataylab: Groq natijalari uchun chegara 60, va
                        // Groq "Avengers" o'rniga "The Avengers" deb qaytarganda
                        // ("the" — stop-so'z, qolgani to'liq mos) natija rad
                        // etilib, foydalanuvchi "film topilmadi" ko'rardi.
                        score = Math.max(score, 70);
                    } else if (coverage >= 0.5) {
                        // Qisman qamrov — foydalanuvchi o'zi yozganda ko'rsatiladi,
                        // lekin Groq natijalari uchun chegaradan (60) past qoladi.
                        score = Math.max(score, Math.round(coverage * 50));
                    }
                }
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
