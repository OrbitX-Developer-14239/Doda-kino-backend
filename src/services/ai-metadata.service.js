import Groq from "groq-sdk";
import { CONFIG } from "../config/index.js";

const groq = new Groq({ apiKey: CONFIG.GROQ_API_KEY });

const MODEL = "openai/gpt-oss-120b";

// DIQQAT: bu model javobdan oldin "reasoning" tokenlarini sarflaydi.
// max_tokens past bo'lsa javob BUTUNLAY bo'sh qaytadi — 1000 dan pasaytirmang.
const MAX_TOKENS = 2500;

const FILM_SYSTEM_PROMPT = `Sen kino ma'lumotlar bazasi uchun ishlaydigan aniq ma'lumot yig'uvchisan.
Foydalanuvchi kino nomini beradi (ba'zan yili va davlati ham). Sen o'sha kinoni aniqlab, quyidagi JSON ni qaytarasan.

FAQAT JSON qaytar, boshqa hech qanday matn yozma. Struktura:
{
  "found": true/false,
  "name": "kinoning O'ZBEKCHA nomi",
  "originalName": "kinoning xalqaro/inglizcha nomi",
  "year": 2015,
  "country": "davlat nomi o'zbekcha (masalan: Rossiya, AQSH, Janubiy Koreya, Buyuk Britaniya)",
  "genres": ["janr1", "janr2"],
  "description": "o'zbekcha tavsif"
}

QOIDALAR:
- "found": kinoni ANIQ bilsang true. Syujeti, davri yoki qahramonlari haqida shubhang
  bo'lsa false qo'y — noto'g'ri ma'lumot yozgandan ko'ra "bilmayman" degan yaxshi.
- found=false bo'lsa ham qolgan maydonlarni bilganingcha to'ldir, lekin tavsifni
  UMUMIY yoz — o'ylab topilgan tafsilot (voqea joyi, yili, qahramon ismlari) qo'shma.
- "name": rasmiy o'zbekcha nomi bo'lsa o'shani yoz, bo'lmasa nomni o'zbekchaga tarjima qil.
- "originalName": FAQAT LOTIN harflarida, kinoning xalqaro (inglizcha) nomi.
  Kirill yoki boshqa yozuvda YOZMA. Masalan "Батальонъ" emas, "Battalion".
  Xalqaro nomi bo'lmasa, asl nomini lotin transliteratsiyasida yoz.
- "genres": FAQAT shu ro'yxatdan tanla, boshqa so'z ishlatma:
  Drama, Jangari, Komediya, Triller, Fantastika, Detektiv, Melodrama, Tarixiy,
  Biografiya, Harbiy, Kriminal, Sarguzasht, Ujas, Multfilm, Hujjatli, Fentezi, Sport, Musiqiy.
  2 tadan 4 tagacha yoz. ("Aksiya", "Ekshn", "Action" kabi so'zlar TAQIQLANGAN — o'rniga "Jangari")
- "description": O'ZBEK TILIDA, 3-5 ta to'liq gap, kamida 200 belgi. Ravon matn bo'lsin.
  Syujetni tushuntir, lekin oxirini oshkor qilma.
  TARIXIY ANIQLIK MUHIM: urush, davr va sana haqida yozayotganda aniq bo'l.
  Qaysi urush yoki yil ekaniga ishonching bo'lmasa, umuman tilga olma.
- "year": faqat raqam (birinchi chiqarilgan yili).
- Foydalanuvchi yil yoki davlat bergan bo'lsa, aynan o'sha kinoni nazarda tutayotganini hisobga ol.`;

const EPISODE_SYSTEM_PROMPT = `Sen serial yoki kino epizodlari uchun ma'lumot tayyorlaysan.
Foydalanuvchi serial yoki kino nomini va qism raqamini beradi.

FAQAT JSON qaytar:
{
  "found": true/false,
  "name": "qism nomi (o'zbekcha)",
  "description": "qism haqida o'zbekcha tavsif"
}

QOIDALAR:
- Qismning aniq nomini bilsang o'shani yoz. Bilmasang "N-qism" ko'rinishida yoz va found=false qil.
- "description": o'zbekcha, 2-4 gap, kamida 100 belgi. Spoiler yozma.
- found=false bo'lsa tavsifni UMUMIY yoz — o'ylab topilgan tafsilot (voqea joyi, sana,
  qahramon ismlari, qaysi urush) QO'SHMA. Bilmagan narsangni yozgandan ko'ra yozmagan yaxshi.
- TARIXIY ANIQLIK MUHIM: davr, urush yoki sanaga ishonching bo'lmasa umuman tilga olma.`;

/**
 * Groq javobini xavfsiz JSON ga aylantiradi.
 * Model ba'zan JSON ni ```json bloki ichida qaytarishi mumkin.
 */
const parseJsonReply = (raw) => {
    if (!raw) return null;

    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();

    try {
        return JSON.parse(text);
    } catch {
        // Oxirgi urinish: matndagi birinchi { ... } blokini ajratib olamiz
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end > start) {
            try { return JSON.parse(text.slice(start, end + 1)); } catch { /* pastda null */ }
        }
        return null;
    }
};

const ask = async (systemPrompt, userPrompt) => {
    if (!CONFIG.GROQ_API_KEY) {
        throw Object.assign(new Error("GROQ_API_KEY sozlanmagan"), { status: 503 });
    }

    let completion;
    try {
        completion = await groq.chat.completions.create({
            model: MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            max_tokens: MAX_TOKENS,
            temperature: 0.3,
            response_format: { type: "json_object" },
        });
    } catch (error) {
        throw Object.assign(
            new Error(`AI xizmatiga ulanib bo'lmadi: ${error.message}`),
            { status: 502 }
        );
    }

    const parsed = parseJsonReply(completion.choices?.[0]?.message?.content);
    if (!parsed) {
        throw Object.assign(new Error("AI tushunarli javob qaytarmadi, qayta urinib ko'ring"), { status: 502 });
    }
    return parsed;
};

const cleanString = (v, fallback = "") =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;

const ALLOWED_GENRES = [
    "Drama", "Jangari", "Komediya", "Triller", "Fantastika", "Detektiv",
    "Melodrama", "Tarixiy", "Biografiya", "Harbiy", "Kriminal", "Sarguzasht",
    "Ujas", "Multfilm", "Hujjatli", "Fentezi", "Sport", "Musiqiy",
];

// Model tez-tez ruscha/inglizcha kalka qaytaradi — ularni to'g'ri janrga moslaymiz
const GENRE_ALIASES = {
    "aksiya": "Jangari", "ekshn": "Jangari", "action": "Jangari", "boevik": "Jangari",
    "komedия": "Komediya", "comedy": "Komediya", "thriller": "Triller",
    "fantasy": "Fentezi", "sci-fi": "Fantastika", "fantastik": "Fantastika",
    "horror": "Ujas", "qo'rqinchli": "Ujas", "qorqinchli": "Ujas",
    "war": "Harbiy", "urush": "Harbiy", "history": "Tarixiy", "tarix": "Tarixiy",
    "crime": "Kriminal", "jinoyat": "Kriminal", "adventure": "Sarguzasht",
    "animation": "Multfilm", "anime": "Multfilm", "documentary": "Hujjatli",
    "romance": "Melodrama", "romantik": "Melodrama", "biography": "Biografiya",
    "detective": "Detektiv", "musical": "Musiqiy",
};

const cleanGenres = (v) => {
    if (!Array.isArray(v)) return [];

    const out = [];
    for (const raw of v) {
        const s = cleanString(raw);
        if (!s) continue;

        const key = s.toLowerCase();
        const exact = ALLOWED_GENRES.find((g) => g.toLowerCase() === key);
        const mapped = exact || GENRE_ALIASES[key];

        if (mapped && !out.includes(mapped)) out.push(mapped);
    }
    return out.slice(0, 4);
};

const hasCyrillic = (s) => /[Ѐ-ӿ]/.test(s);

export const AIMetadataService = {
    /**
     * Kino nomidan (ixtiyoriy yil/davlat bilan) to'liq ma'lumot tayyorlaydi.
     */
    async suggestFilm({ name, year, country }) {
        const hints = [
            `Kino nomi: ${name}`,
            year ? `Chiqarilgan yili: ${year}` : null,
            country ? `Davlati: ${country}` : null,
        ].filter(Boolean).join("\n");

        const data = await ask(FILM_SYSTEM_PROMPT, hints);

        const suggestedYear = Number(data.year);
        const currentYear = new Date().getFullYear();

        // originalName AI qidiruvida moslashtirish uchun ishlatiladi — u lotin
        // yozuvida bo'lishi kerak. Model kirillcha qaytarsa foydalanuvchi kiritgan
        // nomga qaytamiz (u odatda lotinda yozilgan).
        let originalName = cleanString(data.originalName);
        if (!originalName || hasCyrillic(originalName)) originalName = name;

        return {
            found: data.found !== false,
            name: cleanString(data.name, name),
            originalName,
            year: Number.isInteger(suggestedYear) && suggestedYear >= 1800 && suggestedYear <= currentYear
                ? suggestedYear
                : (Number(year) || null),
            country: cleanString(data.country, cleanString(country)),
            genres: cleanGenres(data.genres),
            description: cleanString(data.description),
        };
    },

    /**
     * Serial qismi uchun nom va tavsif tayyorlaydi.
     */
    async suggestEpisode({ filmName, episodeNumber, year, country }) {
        const hints = [
            `Serial nomi: ${filmName}`,
            `Qism raqami: ${episodeNumber}`,
            year ? `Yili: ${year}` : null,
            country ? `Davlati: ${country}` : null,
        ].filter(Boolean).join("\n");

        const data = await ask(EPISODE_SYSTEM_PROMPT, hints);

        return {
            found: data.found !== false,
            name: cleanString(data.name, `${episodeNumber}-qism`),
            description: cleanString(data.description),
        };
    },
};
