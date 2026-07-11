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

                const filmArray = await FilmModel.find();

                if (filmArray.length === 0) {
                    console.log("🤖 [AI]: Bazada qidirish uchun film yo'q, Indexlash qoldirildi.");
                    return;
                }

                const documents = [];
                for (const film of filmArray) {
                    const textContent = film.originalName;

                    const embedding = await embeddingModel.getTextEmbedding(textContent);

                    const doc = new Document({
                        text: textContent,
                        id_: `film_${film._id}`,
                        metadata: { id: film._id.toString(), name: film.name, originalName: film.originalName }
                    });

                    doc.embedding = embedding;
                    documents.push(doc);
                }

                const storageContext = await storageContextFromDefaults({ persistDir: PERSIST_DIR });

                this.index = await VectorStoreIndex.fromDocuments(documents, { storageContext });
                this.retriever = this.index.asRetriever({ similarityTopK: 3 });
                console.log("🤖 [AI]: Indekslash yakunlandi va 'storage/' papkasine xotiraga yozildi.");
            }
            console.log("🤖 [AI]: AI xizmati tayyor ✅");
        } catch (error) {
            console.error("🤖 [AI]: Initializatsiya xatosi:", error.message);
            this.index = null;
            this.retriever = null;
        } finally {
            this.isInitializing = false;
        }
    }

    static async addFilmToIndex(film) {
        if (!this.index) {
            console.log("🤖 [AI]: Indeks yo'q ekan. Film saqlandi, keyingi restartda indekslanadi.");
            return;
        }

        try {
            console.log(`🤖 [AI]: Yangi kino indeks fayliga ulanmoqda -> "${film.originalName}"...`);
            const textContent = film.originalName; // Faqat Nomi 
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
- Har doim kamida eng mos keladigan 10ta filmni qaytar
- Hech qachon episode nomlarini yozma faqat asosiy kino nomlarini yoz
- DIQQAT: Hech qanday qo'shtirnoq, yulduzcha (*), qavslar, raqamlash yoki qator tashlash ishlatma!
- DIQQAT: Hech qanday salomlashish yoki izoh ("Mana", "Ular" kabi) yozma! Mantiqan xato qilsang tizim portlaydi.
- Agar umuman topa olmasang, aynan "Film topilmadi" deb yoz.`;

            const groqResponse = await groq.chat.completions.create({
                model: "openai/gpt-oss-120b",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                max_tokens: 1000,
                temperature: 0.1,
            });

            const predictedText = groqResponse.choices?.[0]?.message?.content?.trim();

            if (!predictedText || predictedText.toLowerCase().includes("topilmadi")) {
                return [];
            }

            console.log(`🤖 [AI]: Ai topgan variantlar: ${predictedText}`);

            const predictedNames = predictedText.split(",").map(n => n.trim()).filter(Boolean);

            const allTermsToSearch = new Set();
            for (const name of predictedNames) {
                allTermsToSearch.add(name);
                if (name.includes(":")) {
                    allTermsToSearch.add(name.split(":")[0].trim());
                }
                if (name.includes("-")) {
                    allTermsToSearch.add(name.split("-")[0].trim());
                }
            }

            const foundFilms = [];
            const foundIds = new Set();


            for (const pName of allTermsToSearch) {
                const dbResults = await FilmService.searchByName(pName);

                if (dbResults && dbResults.length > 0) {
                    dbResults.forEach(film => {
                        const filmIdStr = (film._id || film.id).toString();
                        if (!foundIds.has(filmIdStr)) {
                            foundFilms.push({
                                name: film.name,
                                originalName: film.originalName,
                                id: filmIdStr,
                                year: film.year,
                                code: film.code
                            });
                            foundIds.add(filmIdStr);
                        }
                    });
                }
                if (this.retriever) {
                    try {
                        const nodes = await this.retriever.retrieve({ query: pName });
                        if (nodes && nodes.length > 0) {
                            for (const n of nodes) {
                                console.log(`Score: ${n.score} - ${n.node.metadata.name}`);
                                const mId = n.node.metadata.id;
                                if (n.score >= 0.5 && !foundIds.has(mId)) {
                                    const dbFilm = await FilmModel.findById(mId);
                                    if (dbFilm) {
                                        foundFilms.push({
                                            name: dbFilm.name,
                                            originalName: dbFilm.originalName,
                                            id: mId,
                                            year: dbFilm.year,
                                            code: dbFilm.code
                                        });
                                        foundIds.add(mId);
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error("🤖 [AI]: LlamaIndex xatosi:", e.message);
                    }
                } else if (!this.retriever) {
                    this.init().catch(() => { });
                }
            }

            console.log("Yekuniy topilgan filmlar:", foundFilms);
            return foundFilms;

        } catch (error) {
            console.error("🤖 [AI]: AI bilan bog'lanishda xato:", error);
            return [];
        }
    }
}
