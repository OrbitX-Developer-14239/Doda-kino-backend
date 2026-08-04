import {
    VectorStoreIndex,
    storageContextFromDefaults,
    Settings,
    Document
} from "llamaindex";

import { HuggingFaceEmbedding } from "@llamaindex/huggingface";
import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FilmService } from "./film.service.js";
import { FilmModel } from "../models/film.model.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const PERSIST_DIR = path.resolve(__dirname, "../storage");

const embeddingModel = new HuggingFaceEmbedding({
    modelType: "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
});
Settings.embedModel = embeddingModel;

export class AIService {
    static index = null;
    static retriever = null;
    static isInitializing = false;

    static async init() {
        if (this.index) return;

        if (this.isInitializing) return;
        this.isInitializing = true;

        try {
            const indexStorePath = path.resolve(PERSIST_DIR, "index_store.json");

            if (fs.existsSync(indexStorePath)) {
                console.log("🤖 [AI]: Tayyor film vektorlari fayldan yuklanmoqda...");
                const storageContext = await storageContextFromDefaults({ persistDir: PERSIST_DIR });
                this.index = await VectorStoreIndex.init({ storageContext });
                this.retriever = this.index.asRetriever({ similarityTopK: 5 });
            } else {
                console.log("🤖 [AI]: Yangi film indeksi hisoblanmoqda...");

                if (!fs.existsSync(PERSIST_DIR)) {
                    fs.mkdirSync(PERSIST_DIR, { recursive: true });
                }

                // Faqat kerakli maydonlar (ilgari `episodes` massivi bilan birga
                // to'liq hujjatlar hydratsiya qilinardi)
                const filmArray = await FilmModel.find()
                    .select("name originalName")
                    .lean();

                if (filmArray.length === 0) {
                    console.log("🤖 [AI]: Bazada qidirish uchun film yo'q, Indexlash qoldirildi.");
                    return;
                }

                const documents = [];
                const BATCH = 16;

                // Embedding lar to'plamlar bo'yicha hisoblanadi — bittalab ketma-ket
                // hisoblash katta katalogda indekslashni bir necha barobar cho'zardi.
                for (let i = 0; i < filmArray.length; i += BATCH) {
                    const batch = filmArray.slice(i, i + BATCH);
                    const embeddings = await Promise.all(
                        batch.map((film) => embeddingModel.getTextEmbedding(film.originalName))
                    );

                    batch.forEach((film, idx) => {
                        const doc = new Document({
                            text: film.originalName,
                            id_: `film_${film._id}`,
                            metadata: { id: film._id.toString(), name: film.name, originalName: film.originalName }
                        });
                        doc.embedding = embeddings[idx];
                        documents.push(doc);
                    });
                }

                const storageContext = await storageContextFromDefaults({ persistDir: PERSIST_DIR });

                this.index = await VectorStoreIndex.fromDocuments(documents, { storageContext });
                this.retriever = this.index.asRetriever({ similarityTopK: 3 });
                console.log("🤖 [AI]: Indekslash yakunlandi va 'storage/' papkasine xotiraga yozildi.");
            }
            console.log("🤖 [AI]: AI xizmati tayyor ✅");

            // Embedding modeli birinchi ishlatilganda yuklanadi (birinchi marta —
            // internetdan). Uni shu yerda oldindan isitamiz, aks holda restartdan
            // keyingi BIRINCHI qidiruv bir necha sekundga cho'ziladi.
            this.warmUp();
        } catch (error) {
            console.error("🤖 [AI]: Initializatsiya xatosi:", error.message);
            this.index = null;
            this.retriever = null;
        } finally {
            this.isInitializing = false;
        }
    }

    static warmUp() {
        const started = Date.now();
        embeddingModel.getTextEmbedding("warmup")
            .then(() => console.log(`🤖 [AI]: Embedding modeli tayyor (${Date.now() - started} ms)`))
            .catch((e) => console.warn("🤖 [AI]: Embedding modelini isitib bo'lmadi:", e.message));
    }

    static async addFilmToIndex(film) {
        if (!this.index) {
            console.log("🤖 [AI]: Indeks yo'q ekan. Film saqlandi, keyingi restartda indekslanadi.");
            return;
        }

        try {
            console.log(`🤖 [AI]: Yangi kino indeks fayliga ulanmoqda -> "${film.originalName}"...`);
            const textContent = film.originalName;
            const embedding = await embeddingModel.getTextEmbedding(textContent);

            const doc = new Document({
                text: textContent,
                id_: `film_${film._id}`,
                metadata: { id: film._id.toString(), name: film.name, originalName: film.originalName }
            });
            doc.embedding = embedding;

            await this.index.insert(doc);
            console.log(`🤖 [AI]: "${film.name}" indeksi muvaffaqiyatli saqlandi! ✅`);
        } catch (error) {
            console.error("🤖 [AI]: Filmni o'zlashtirishda kutilmagan xatolik:", error.message);
        }
    }

    static async askAI(userMessage) {
        try {
            const systemPrompt = `Sen yordamchi emassan, sen toza Data filter qiluvchi scriptsan.
QOIDALAR:
- Foydalanuvchi filmni izohlaydi. Sening vazifang mos keluvchi barcha kino nomlarini topish.
- Natijani FAQAT vergul (,) bilan ajratilgan xalqaro inglizcha nomlar shaklida yoz. Masalan: The Matrix, Inception, Avengers, Avatar
- Nomlarni faqatgina ingliz tilida yoz
- Agar foydalanuvchi film nomini yozsa o'sha nomni vergul bilan ajratib ingliz va o'zbek tilida yoz. Masalan: user: "qasoskorlar" -> "Qasoskorlar, Avengers"
- Har doim kamida eng mos keladigan 10ta filmni qaytar
- Hech qachon episode nomlarini yozma faqat asosiy kino nomlarini yoz
- DIQQAT: Hech qanday qo'shtirnoq, yulduzcha (*), qavslar, raqamlash yoki qator tashlash ishlatma!
- DIQQAT: Hech qanday salomlashish yoki izoh ("Mana", "Ular" kabi) yozma! Mantiqan xato qilsang tizim portlaydi.
- Agar umuman topa olmasang, aynan "Film topilmadi" deb yoz.`;

            // Foydalanuvchi kiritgan matn bo'yicha qidiruv LLM javobiga bog'liq emas,
            // shuning uchun u Groq chaqiruvi bilan BIR VAQTDA boshlanadi.
            const directMatchesPromise = FilmService.searchByNames([userMessage]).catch(() => []);

            const groqResponse = await groq.chat.completions.create({
                model: "openai/gpt-oss-120b",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                // Diqqat: bu model "reasoning" tokenlarini ham shu limitdan sarflaydi.
                // 1000 dan pasaytirilsa javob umuman bo'sh qaytadi.
                max_tokens: 1000,
                temperature: 0.1,
            });

            const predictedText = groqResponse.choices?.[0]?.message?.content?.trim();
            const llmFailed = !predictedText || predictedText.toLowerCase().includes("topilmadi");

            if (!llmFailed) {
                console.log(`🤖 [AI]: Ai topgan variantlar: ${predictedText}`);
            }

            const predictedNames = llmFailed
                ? []
                : predictedText.split(",").map(n => n.trim()).filter(Boolean);

            const allTermsToSearch = new Set();
            allTermsToSearch.add(userMessage);
            for (const name of predictedNames) {
                allTermsToSearch.add(name);
                if (name.includes(":")) {
                    allTermsToSearch.add(name.split(":")[0].trim());
                }
                if (name.includes("-")) {
                    allTermsToSearch.add(name.split("-")[0].trim());
                }
            }

            const searchTerms = [...allTermsToSearch];
            const foundFilms = [];
            const foundIds = new Set();

            const pushFilm = (film) => {
                const filmIdStr = (film._id || film.id).toString();
                if (foundIds.has(filmIdStr)) return;
                foundIds.add(filmIdStr);
                foundFilms.push({
                    name: film.name,
                    originalName: film.originalName,
                    id: filmIdStr,
                    year: film.year,
                    code: film.code
                });
            };

            // Groq bilan parallel boshlangan to'g'ridan-to'g'ri qidiruv natijalari
            // birinchi bo'lib qo'shiladi — LLM ishlamay qolsa ham qidiruv ishlaydi.
            (await directMatchesPromise).forEach(pushFilm);

            // Qolgan barcha so'zlar BITTA so'rovda qidiriladi.
            // Ilgari har bir so'z uchun alohida, ketma-ket regex skanerlash bo'lardi
            // (20+ marta butun kolleksiya) — bu qidiruvni bir necha sekundga cho'zardi.
            if (predictedNames.length) {
                const dbResults = await FilmService.searchByNames(searchTerms);
                dbResults.forEach(pushFilm);
            }

            if (!this.retriever) {
                this.init().catch(() => { });
            } else {
                try {
                    // Vektor qidiruvi ham parallel bajariladi
                    const nodeGroups = await Promise.all(
                        searchTerms.map((term) =>
                            this.retriever.retrieve({ query: term }).catch(() => [])
                        )
                    );

                    const candidateIds = new Set();
                    for (const nodes of nodeGroups) {
                        for (const n of nodes || []) {
                            const mId = n.node?.metadata?.id;
                            if (mId && n.score >= 0.5 && !foundIds.has(mId)) {
                                candidateIds.add(mId);
                            }
                        }
                    }

                    if (candidateIds.size) {
                        // N ta alohida findById o'rniga bitta $in so'rovi
                        const vectorFilms = await FilmModel.find({ _id: { $in: [...candidateIds] } })
                            .select("name originalName code year")
                            .lean();
                        vectorFilms.forEach(pushFilm);
                    }
                } catch (e) {
                    console.error("🤖 [AI]: LlamaIndex xatosi:", e.message);
                }
            }

            return foundFilms;

        } catch (error) {
            console.error("🤖 [AI]: AI bilan bog'lanishda xato:", error);
            return [];
        }
    }
}
