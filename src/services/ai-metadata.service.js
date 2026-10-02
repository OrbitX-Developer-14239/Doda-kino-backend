import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { CONFIG } from "../config/index.js";

// Google Gemini birlamchi provayder
const geminiApiKey = CONFIG.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

// Barqarorlik va eng yuqori sifat uchun ketma-ket modellar zaxirasi:
// 1. gemini-3.8-flash — eng kuchli, eng yangi model
// 2. gemini-2.5-flash — barqaror va tezkor zaxira
// 3. gemini-3.5-flash-lite — yengil zaxira modeli
const GEMINI_MODELS = [
    "gemini-2.5-flash",
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite"
];

// Zaxira sifatida Groq (agar Gemini umuman ishlamay qolsa)
const groq = CONFIG.GROQ_API_KEY ? new Groq({ apiKey: CONFIG.GROQ_API_KEY }) : null;
const GROQ_MODEL = "openai/gpt-oss-120b";

const FILM_SYSTEM_PROMPT = `Sen kino va seriallar ma'lumotlar bazasi bo'yicha ekspertisan.
Foydalanuvchi kino yoki serial nomini O'ZBEK TILIDA (yoki rus/ingliz) yozadi.

Sening asosiy vazifang:
1. O'zbekcha tarjima qilingan film nomini tahlil qilib, uning ASLIY XALQARO (inglizcha yoki original) nomini aniqlash.
Masalan:
- "Tinch okeani daxshatlari" -> Asl nomi: "Pacific Rim" (2013)
- "Javohir politsiyachi" -> Asl nomi: "Blue Streak" (1999)
- "Qasoskorlar" -> Asl nomi: "The Avengers" (2012)
- "Yulduzlararo" -> Asl nomi: "Interstellar" (2014)
- "Forsaj" yoki "Tezkor va g'azablangan" -> Asl nomi: "The Fast and the Furious"
- "Garri Potter" -> Asl nomi: "Harry Potter"
- "Qora ritsar" -> Asl nomi: "The Dark Knight"
- "Titanik" -> Asl nomi: "Titanic"
- "Boshlanish" -> Asl nomi: "Inception"
- "Taxtlar o'yini" -> Asl nomi: "Game of Thrones"

2. Foydalanuvchi bergan nomga qarab, agar u jahon kinosidagi yoki o'zbek/rus/turk filmi bo'lsa, uning to'liq ma'lumotlarini topib berasan.
3. Agar film haqiqatdan mavjud bo'lsa va uni aniqlagan bo'lsang, DOIMO "found": true qo'y! O'zbekcha nomini bilganingdan keyin hech qachon shubhalanib "found": false qo'yma! Faqat film umuman mavjud bo'lmasa "found": false qil.

FAQAT JSON formatda qaytar, boshqa hech qanday matn yozma.
Struktura:
{
  "found": true,
  "name": "kinoning O'ZBEKCHA nomi (masalan: Tinch okeani daxshatlari)",
  "originalName": "kinoning xalqaro/inglizcha nomi (faqat LOTIN harflarida, masalan: Pacific Rim)",
  "year": 2013,
  "country": "davlat nomi o'zbekcha (masalan: Rossiya, AQSH, Janubiy Koreya, Buyuk Britaniya, Fransiya)",
  "genres": ["janr1", "janr2"],
  "description": "o'zbekcha tavsif (3-5 ta to'liq gap, syujetni qiziqarli tushuntir, spoiler bermasdan)"
}

QOIDALAR:
- "originalName": FAQAT LOTIN harflarida, kinoning xalqaro (inglizcha) nomi. Kirill yoki boshqa yozuvda YOZMA.
- "genres": FAQAT shu ro'yxatdan tanla (2 tadan 4 tagacha):
  Drama, Jangari, Komediya, Triller, Fantastika, Detektiv, Melodrama, Tarixiy,
  Biografiya, Harbiy, Kriminal, Sarguzasht, Ujas, Multfilm, Hujjatli, Fentezi, Sport, Musiqiy.
  ("Aksiya", "Ekshn", "Action" kabi so'zlar o'rniga DOIMO "Jangari" ishlat)
- "description": O'ZBEK TILIDA, 3-5 ta to'liq gap, kamida 150 belgi. Ravon va qiziqarli matn bo'lsin.
- "year": faqat raqam (birinchi chiqarilgan yili).
- Foydalanuvchi yil yoki davlat bergan bo'lsa, aynan o'sha kinoni nazarda tutayotganini hisobga ol.`;

const EPISODE_SYSTEM_PROMPT = `Sen serial yoki kino epizodlari uchun ma'lumot tayyorlaysan.
Foydalanuvchi serial yoki kino nomini va qism raqamini beradi.

FAQAT JSON qaytar:
{
  "found": true,
  "name": "qism nomi (o'zbekcha)",
  "description": "qism haqida o'zbekcha tavsif"
}

QOIDALAR:
- Qismning aniq nomini bilsang o'shani yoz. Bilmasang "N-qism" ko'rinishida yoz va found=false qil.
- "description": o'zbekcha, 2-4 gap, kamida 100 belgi. Spoiler yozma.
- found=false bo'lsa tavsifni UMUMIY yoz — o'ylab topilgan tafsilot QO'SHMA.`;

/**
 * AI javobini xavfsiz JSON ga aylantiradi.
 */
const parseJsonReply = (raw) => {
    if (!raw) return null;

    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();

    try {
        return JSON.parse(text);
    } catch {
        const start = text.indexOf("{");
        const end = text.lastIndexOf("}");
        if (start !== -1 && end > start) {
            try { return JSON.parse(text.slice(start, end + 1)); } catch { /* ignore */ }
        }
        return null;
    }
};

/**
 * Asosiy so'rov funksiyasi: birinchi bo'lib Google Gemini'dan so'raydi,
 * agar birorta modelda 503 bo'lsa keyingisiga o'tadi, oxirgi zaxira sifatida Groq ishlatiladi.
 */
const ask = async (systemPrompt, userPrompt) => {
    // 1. Google Gemini bilan urinib ko'rish
    if (genAI) {
        for (const modelName of GEMINI_MODELS) {
            try {
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    systemInstruction: systemPrompt,
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.2,
                    },
                });

                const result = await model.generateContent(userPrompt);
                const rawText = result.response.text();
                const parsed = parseJsonReply(rawText);
                if (parsed) {
                    return parsed;
                }
            } catch (err) {
                console.warn(`⚠️ [Gemini-${modelName} xatosi]: ${err.message}. Keyingi modelga o'tilmoqda...`);
            }
        }
    }

    // 2. Agar Gemini ishlamasa yoki sozlanmagan bo'lsa, zaxiradagi Groq
    if (groq) {
        console.warn("⚠️ [AIMetadataService]: Gemini javob bermadi, zaxiradagi Groq ishga tushirildi...");
        try {
            const completion = await groq.chat.completions.create({
                model: GROQ_MODEL,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                max_tokens: 2500,
                temperature: 0.3,
                response_format: { type: "json_object" },
            });

            const parsed = parseJsonReply(completion.choices?.[0]?.message?.content);
            if (parsed) return parsed;
        } catch (groqErr) {
            console.error("❌ [Groq xatosi]:", groqErr.message);
        }
    }

    throw Object.assign(
        new Error("AI xizmatidan ma'lumot olib bo'lmadi, iltimos qayta urinib ko'ring"),
        { status: 502 }
    );
};

const cleanString = (v, fallback = "") =>
    typeof v === "string" && v.trim() ? v.trim() : fallback;

const ALLOWED_GENRES = [
    "Drama", "Jangari", "Komediya", "Triller", "Fantastika", "Detektiv",
    "Melodrama", "Tarixiy", "Biografiya", "Harbiy", "Kriminal", "Sarguzasht",
    "Ujas", "Multfilm", "Hujjatli", "Fentezi", "Sport", "Musiqiy",
];

const GENRE_ALIASES = {
    "aksiya": "Jangari", "ekshn": "Jangari", "action": "Jangari", "boevik": "Jangari",
    "komediya": "Komediya", "comedy": "Komediya", "thriller": "Triller",
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

const hasCyrillic = (s) => /[\u0400-\u04FF]/.test(s);

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
