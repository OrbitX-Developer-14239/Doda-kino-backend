import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { tenantProp } from "../core/tenant-context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = path.resolve(__dirname, "../storage");

/**
 * ============================================
 *  Xotiradagi film qidiruv indeksi (multibot)
 * ============================================
 *
 * HAR BOT O'Z INDEKSIGA EGA — FilmSearchIndex klassi tenant-registry da
 * har bot uchun alohida yaratiladi (film boshiga ~3 KB, arzon).
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
 * `storage/search-index-<botId>.json` faqat tez ishga tushish uchun nusxa;
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

/** Sarlavhaning ma'noli so'zlari (stop-so'zlarsiz) */
const titleWords = (nTitle) =>
    nTitle.split(" ").filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

const toEntry = (f) => {
    const nName = normalize(f.name);
    const nOriginal = normalize(f.originalName);

    return {
        code: f.code,
        name: f.name,
        originalName: f.originalName,
        year: f.year,
        nName,
        nOriginal,
        // Ikkalasi ALOHIDA: moslik "o'zbekcha nom" yoki "asl nom" ning
        // BIRIGA to'liq mos kelishi kerak. Ilgari ular bitta to'plamga
        // qo'shilardi va "Qasoskorlar"+"Avengers" aralashib ketardi.
        nameWords: titleWords(nName),
        origWords: titleWords(nOriginal),
    };
};

/** "matematik" <-> "matematikaning". Qisqa so'zlar uchun faqat aniq moslik. */
const wordMatches = (a, b) =>
    a === b ||
    (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)));

export class FilmSearchIndex {
    /**
     * @param {number} botId - Telegram bot ID (snapshot fayl nomi uchun)
     * @param {import("mongoose").Model} filmModel - shu botning Film modeli
     */
    constructor(botId, filmModel) {
        this.botId = botId;
        this.FilmModel = filmModel;
        this.snapshotPath = path.join(STORAGE_DIR, `search-index-${botId}.json`);
        this.entries = [];
        this.ready = false;
    }

    get size() { return this.entries.length; }
    get isReady() { return this.ready; }

    /** Bazadan to'liq qayta quradi */
    async rebuild() {
        const films = await this.FilmModel.find()
            .select("code name originalName year")
            .lean();

        this.entries = films.map(toEntry);
        this.ready = true;

        await this._saveSnapshot().catch(() => { });
        return this.entries.length;
    }

    /**
     * Ishga tushishda: nusxadan o'qiydi, lekin bazadagi son bilan
     * solishtiradi — mos kelmasa qayta quradi (eskirgan nusxa ishlatilmaydi).
     */
    async init() {
        try {
            const [raw, dbCount] = await Promise.all([
                fs.readFile(this.snapshotPath, "utf8"),
                this.FilmModel.estimatedDocumentCount(),
            ]);
            const snap = JSON.parse(raw);

            if (Array.isArray(snap.films) && snap.films.length === dbCount) {
                this.entries = snap.films.map(toEntry);
                this.ready = true;
                return { source: "nusxa", count: this.entries.length };
            }
        } catch { /* nusxa yo'q yoki buzuq — bazadan quramiz */ }

        const count = await this.rebuild();
        return { source: "baza", count };
    }

    async _saveSnapshot() {
        const payload = {
            updatedAt: new Date().toISOString(),
            films: this.entries.map((e) => ({
                code: e.code, name: e.name, originalName: e.originalName,
                year: e.year,
            })),
        };
        await fs.mkdir(STORAGE_DIR, { recursive: true });
        await fs.writeFile(this.snapshotPath, JSON.stringify(payload));
    }

    // ── Sinxronlash (film o'zgarganda chaqiriladi) ──────────────────────────

    upsert(film) {
        if (!film?.code) return;
        const entry = toEntry(film);
        const i = this.entries.findIndex((e) => e.code === entry.code);
        if (i === -1) this.entries.push(entry); else this.entries[i] = entry;
        this._saveSnapshot().catch(() => { });
    }

    remove(code) {
        this.entries = this.entries.filter((e) => e.code !== Number(code));
        this._saveSnapshot().catch(() => { });
    }

    // ── Qidiruv ─────────────────────────────────────────────────────────────

    /**
     * Bitta so'rov bo'yicha NOMLARDAN qidiradi va ballab qaytaradi.
     * Ball: to'liq moslik > boshlanishi > qism-satr > so'z qamrovi
     */
    search(query, limit = 12) {
        if (!this.ready) return [];

        const nQuery = normalize(query);
        if (nQuery.length < 2) return [];

        const qWords = tokenize(query).filter((w) => !STOP_WORDS.has(w));
        const scored = [];

        for (const e of this.entries) {
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
                // Qamrov IKKI tomonlama hisoblanadi:
                //   qCov — so'rov so'zlarining nechasi sarlavhada bor
                //   tCov — sarlavha so'zlarining nechasi so'rovda bor
                //
                // Faqat qCov ni qarash yetarli emas edi: "Iron Man" so'rovining
                // ikkala so'zi ham "The Man in the Iron Mask" ichida bor (qCov=1),
                // lekin bu butunlay boshqa film. tCov buni ushlaydi (2/3).
                for (const tWords of [e.nameWords, e.origWords]) {
                    if (!tWords.length) continue;

                    let mq = 0;
                    for (const w of qWords) {
                        if (tWords.some((t) => wordMatches(w, t))) mq++;
                    }
                    if (!mq) continue;

                    let mt = 0;
                    for (const t of tWords) {
                        if (qWords.some((w) => wordMatches(w, t))) mt++;
                    }

                    const qCov = mq / qWords.length;
                    const tCov = mt / tWords.length;

                    if (qCov === 1 && tCov === 1) {
                        // Sarlavha bilan so'rov ma'noli so'zlar bo'yicha AYNAN
                        // bir xil (faqat artikl/tartib farq qiladi):
                        // "The Avengers" = "Avengers". Groq shu shaklda ham
                        // qaytargani uchun bu chegaradan (60) yuqori bo'lishi shart.
                        score = Math.max(score, 90);
                    } else if (tCov === 1 && qCov >= 0.5 && tWords.length >= 2) {
                        // So'rov sarlavhani to'liq o'z ichiga oladi, masalan
                        // "The Man in the Iron Mask" -> "The Iron Mask".
                        //
                        // Sarlavha kamida 2 so'zli bo'lishi SHART. Bir so'zli
                        // sarlavhada bu shart o'z-o'zidan bajariladi va boshqa
                        // filmni tortib kelardi: "The Legend of Tarzan" so'rovi
                        // "Afsona" (Legend) ni qaytarardi.
                        score = Math.max(score, 70);
                    } else if (qCov === 1) {
                        // So'rov sarlavhaning bir qismi: "matematik" ->
                        // "Matematik mo'jizalar". Foydalanuvchi o'zi yozganda
                        // ko'rsatiladi, lekin Groq chegarasidan (60) past.
                        score = Math.max(score, 50);
                    } else if (qCov >= 0.5) {
                        score = Math.max(score, Math.round(qCov * 50));
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
    }

    /**
     * ZAXIRA qidiruv: uzun tavsif ichida film NOMI yashiringan holat uchun.
     *
     * "qo'rqinchli masxaraboz bolalarni o'g'irlaydi" — bu tavsif, lekin
     * ichida "Masxaraboz Ono" filmining nomi bor. Asosiy `search()` uni
     * ko'rmaydi: 4 so'zdan faqat 1 tasi mos kelgani (qamrov 0.25) uzun
     * tasviriy so'rovlarda shovqin bo'lgani uchun ataylab rad etiladi.
     *
     * Shuning uchun bu FAQAT Groq hech nima topa olmaganda chaqiriladi —
     * u holda tanlov "taxminiy natija" va "bo'sh ekran" o'rtasida bo'ladi.
     * Faqat uzun (>= 5 harf) so'zlar hisobga olinadi, qisqalari tasodifan
     * mos kelib ketardi.
     */
    searchLoose(query, limit = 6) {
        if (!this.ready) return [];

        const qWords = tokenize(query)
            .filter((w) => !STOP_WORDS.has(w) && w.length >= 5);
        if (!qWords.length) return [];

        const scored = [];

        for (const e of this.entries) {
            let best = 0;
            for (const tWords of [e.nameWords, e.origWords]) {
                if (!tWords.length) continue;
                let mt = 0;
                for (const t of tWords) {
                    if (t.length >= 5 && qWords.some((w) => wordMatches(w, t))) mt++;
                }
                if (mt) best = Math.max(best, mt / tWords.length);
            }
            // Sarlavhaning kamida yarmi so'rovda uchrashi kerak
            if (best >= 0.5) scored.push({ e, score: Math.round(best * 40) });
        }

        return scored
            .sort((a, b) => b.score - a.score || String(a.e.name).localeCompare(String(b.e.name)))
            .slice(0, limit)
            .map(({ e, score }) => ({
                code: e.code, name: e.name, originalName: e.originalName,
                year: e.year, _score: score,
            }));
    }

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
    }
}

/**
 * Joriy so'rovning botiga tegishli indeksga proxy.
 * Servislar ilgarigidek `SearchIndex.search(...)` deb chaqiraveradi.
 */
export const SearchIndex = tenantProp("searchIndex");
