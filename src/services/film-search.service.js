import Groq from "groq-sdk";
import { CONFIG } from "../config/index.js";
import { SearchIndex } from "./search-index.service.js";

const groq = new Groq({ apiKey: CONFIG.GROQ_API_KEY });

const MODEL = "openai/gpt-oss-120b";

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
    async search(query) {
        const direct = SearchIndex.search(query);
        if (direct.length) {
            return { films: strip(direct), source: "index" };
        }

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

            const names = new Set();
            for (const raw of text.split(",")) {
                const name = raw.trim();
                if (!name) continue;
                names.add(name);

                if (name.includes(":")) names.add(name.split(":")[0].trim());

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
