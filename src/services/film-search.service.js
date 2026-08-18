import Groq from "groq-sdk";
import { CONFIG } from "../config/index.js";
import { SearchIndex } from "./search-index.service.js";

const groq = new Groq({ apiKey: CONFIG.GROQ_API_KEY });

// Diqqat: bu model javobdan oldin "reasoning" tokenlarini sarflaydi.
// max_tokens past bo'lsa javob BUTUNLAY bo'sh qaytadi.
const MODEL = "openai/gpt-oss-120b";

// O'lchangan: uzun tasviriy so'rovda "reasoning" ~700-860 token yeydi.
// 1000 limitida javobga 140 token qolib, model tez-tez BO'SH qaytarardi —
// aynan shu sababli "yerda superqahramonlar bo'ladi..." kabi so'rovlarga
// Groq hech narsa bermay, foydalanuvchi tavsif bo'yicha topilgan aloqasiz
// natijalarni ko'rardi. 3000 da o'ylash uchun ham, javob uchun ham yetarli.
const MAX_TOKENS = 3000;

const SYSTEM_PROMPT = `Sen yordamchi emassan, sen toza Data filter qiluvchi scriptsan.
QOIDALAR:
- Foydalanuvchi kinoni izohlaydi yoki nomini yozadi. Sen mos keluvchi kinolarni topasan.
- Natijani FAQAT vergul (,) bilan ajratilgan XALQARO INGLIZCHA nomlar shaklida yoz.
  Masalan: The Matrix, Inception, Avengers, Interstellar
- Hech qanday qo'shtirnoq, raqamlash, qavs yoki izoh yozma.
- Eng mos keladigan 10 ta kino nomini qaytar.
- Epizod/qism nomlarini emas, asosiy kino nomlarini yoz.
- Agar umuman topa olmasang, aynan "Film topilmadi" deb yoz.`;

export const FilmSearchService = {
    /**
     * Ikki bosqichli qidiruv:
     *   1) Xotiradagi indeks — FAQAT NOM bo'yicha (~1 ms, tarmoqsiz,
     *      o'zbekcha apostroflarni hisobga oladi). Nom yozgan foydalanuvchi
     *      shu yerda javob oladi.
     *   2) Nom topilmasa bu TASVIR — Groq uni kino nomlariga aylantiradi,
     *      keyin o'sha nomlar yana indeksdan qidiriladi. Tavsif indeksda
     *      umuman yo'q: tavsif so'zlari bo'yicha moslik aloqasiz natijalar
     *      berardi (sinovda 12 ta begona film chiqqan).
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
        if (!predicted.length) {
            return { films: [], source: "groq-empty" };
        }

        const hits = SearchIndex.searchMany(predicted);
        return { films: strip(hits), source: "groq", predicted };
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
            if (!text || /topilmadi/i.test(text)) return [];

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
                const noArticle = name.replace(/^(the|a|an)s+/i, "").trim();
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
