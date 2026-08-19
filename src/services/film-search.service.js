import Groq from "groq-sdk";
import { CONFIG } from "../config/index.js";
import { SearchIndex } from "./search-index.service.js";

const groq = new Groq({ apiKey: CONFIG.GROQ_API_KEY });

const MODEL = "openai/gpt-oss-120b";

// O'lchangan: bu model javobdan oldin "reasoning" tokenlarini sarflaydi —
// uzun tasviriy so'rovda ~700-860 ta. 1000 limitida javobga 140 token qolib,
// model tez-tez BUTUNLAY bo'sh qaytarardi. 3000 ikkalasiga ham yetadi.
const MAX_TOKENS = 3000;

const NOT_FOUND = "NOT_FOUND";

// Ingliz tilida: model ko'rsatmalarni aniqroq bajaradi.
//
// 10 ta nomzod MAJBURIY. Nomzodlar bizning katalog bilan kesishtirilgani
// uchun ortiqcha taxmin zararsiz — mos kelmasa shunchaki tashlab yuboriladi.
// Yetishmagan nomzod esa "film topilmadi" degani. O'lchangan: "at most 10"
// deyilganda model bittagina nom qaytarib, natija yo'qolib ketdi.
const SYSTEM_PROMPT = `You are a film title resolver. You are not an assistant.

INPUT: one Uzbek message. It either names a film or describes its plot,
characters, or a scene from it.

TASK: list every film the message could refer to.

OUTPUT — follow exactly:
- Print 10 official English film titles, separated by ", ".
- Order them from most to least likely.
- Always fill all 10 slots. If you are sure about one film, use the
  remaining slots for its sequels, prequels, remakes, and other films with
  the closest plot. A wrong guess is harmless; a missing one is not.
- Include short one-word titles when they fit, such as It, Us, Alien, Saw.
- Print the short canonical title. Drop leading articles and subtitles:
  print "Avengers", not "The Avengers: Endgame".
- Never print numbering, quotes, brackets, notes, or any other text.
- Print exactly ${NOT_FOUND} only when the message is not about a film.`;

export const FilmSearchService = {
    /**
     * Uch bosqichli qidiruv:
     *   1) Xotiradagi indeks — FAQAT NOM bo'yicha (~1 ms, tarmoqsiz,
     *      o'zbekcha apostroflarni hisobga oladi). Nom yozgan foydalanuvchi
     *      shu yerda javob oladi.
     *   2) Nom topilmasa bu TASVIR — Groq uni kino nomlariga aylantiradi,
     *      keyin o'sha nomlar yana indeksdan qidiriladi. Tavsif indeksda
     *      umuman yo'q: tavsif so'zlari bo'yicha moslik aloqasiz natijalar
     *      berardi (sinovda 12 ta begona film chiqqan).
     *   3) Groq ham topa olmasa — zaxira: tavsif ichida film nomi
     *      yashiringan bo'lishi mumkin.
     *
     * Vektor qidiruv ATAYLAB ishlatilmaydi (`ai.service.js` da turibdi):
     * o'lchov ko'rsatdiki, u 10 ta so'rovdan 1 tasida natija qo'shdi va
     * o'sha ham noto'g'ri edi — buning evaziga ~1.1 GB RAM egallardi.
     */
    async search(query) {
        const direct = SearchIndex.search(query);
        if (direct.length) {
            return { films: strip(direct), source: "index" };
        }

        // Nomlardan topilmadi -> bu tasvir. Groq nomga aylantiradi.
        const predicted = await this._askGroq(query);

        if (predicted.length) {
            const hits = SearchIndex.searchMany(predicted);
            if (hits.length) {
                return { films: strip(hits), source: "groq", predicted };
            }
        }

        // Groq katalogdagi filmni topa olmadi. Oxirgi imkoniyat: tavsif
        // ichida film nomi yashiringan bo'lishi mumkin — "qo'rqinchli
        // masxaraboz bolalarni o'g'irlaydi" ichidagi "Masxaraboz Ono" kabi.
        const loose = SearchIndex.searchLoose(query);
        if (loose.length) {
            return { films: strip(loose), source: "index-zaxira", predicted };
        }

        return { films: [], source: predicted.length ? "groq" : "groq-empty", predicted };
    },

    async _askGroq(query) {
        if (!CONFIG.GROQ_API_KEY) return [];

        try {
            const res = await groq.chat.completions.create({
                model: MODEL,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: query },
                ],
                max_tokens: MAX_TOKENS,
                temperature: 0.1,
            });

            const text = res.choices?.[0]?.message?.content?.trim();
            // NOT_FOUND — promptda aytilgan belgi. "topilmadi" ham tekshiriladi:
            // model ba'zan o'zbekcha so'rovga o'zbekcha javob yozib yuboradi.
            if (!text || /not_?found|topilmadi/i.test(text)) return [];

            // Groq bir xil filmni har safar boshqacha yozadi: goh "Avengers",
            // goh "The Avengers", goh "Avengers: Endgame". Katalogda esa bitta
            // yozuv bor. Shuning uchun har nomning variantlari ham qidiriladi —
            // aks holda javob tasodifga bog'liq bo'lib qolardi.
            const names = new Set();
            for (const raw of text.split(",")) {
                const name = raw.trim();
                if (!name) continue;
                names.add(name);

                // "Avengers: Endgame" -> "Avengers"
                if (name.includes(":")) names.add(name.split(":")[0].trim());

                // "The Avengers" -> "Avengers"
                const noArticle = name.replace(/^(the|a|an)\s+/i, "").trim();
                if (noArticle && noArticle !== name) names.add(noArticle);
            }
            return [...names].slice(0, 24);
        } catch (error) {
            console.error("🔎 [Qidiruv]: Groq xatosi:", error.message);
            return [];
        }
    },
};

/** Ichki ball maydonini javobdan olib tashlaydi */
const strip = (list) => list.map(({ _score, ...rest }) => rest);
