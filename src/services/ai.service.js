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

// 1. Embedding modelni sozlaymiz
const embeddingModel = new HuggingFaceEmbedding({
    modelType: "Xenova/all-MiniLM-L6-v2"
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
                this.retriever = this.index.asRetriever({ similarityTopK: 3 });
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
                    const textContent = film.name; // Faqat NOMINI o'qiydi va saqlaydi!

                    const embedding = await embeddingModel.getTextEmbedding(textContent);

                    const doc = new Document({
                        text: textContent,
                        id_: `film_${film._id}`,
                        metadata: { id: film._id.toString(), name: film.name }
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

    // 🔥 ALOHIDA FUNKSIYA: MUVAFFAQIYATLI QO'SHILGANDAN KEYIN AYTILADIGAN
    static async addFilmToIndex(film) {
        if (!this.index) {
            console.log("🤖 [AI]: Indeks yo'q ekan. Film saqlandi, keyingi restartda indekslanadi.");
            return;
        }

        try {
            console.log(`🤖 [AI]: Yangi kino indeks fayliga ulanmoqda -> "${film.name}"...`);
            const textContent = film.name; // Faqat Nomi 
            const embedding = await embeddingModel.getTextEmbedding(textContent);

            const doc = new Document({
                text: textContent,
                id_: `film_${film._id}`,
                metadata: { id: film._id.toString(), name: film.name }
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
            // 1. QADAM: Eng birinchi bo'lib User yozgan matnni to'g'ridan-to'g'ri AI (Groq) ga uzatamiz.
            const systemPrompt = `Sen yordamchi emassan, sen toza Data filter qiluvchi scriptsan.
QOIDALAR:
- Foydalanuvchi filmni izohlaydi. Sening vazifang mos keluvchi barcha kino nomlarini topish.
- Natijani FAQAT vergul (,) bilan ajratilgan toza nomlar shaklida yoz. Masalan: Titanik, Qochish rejasi, Avatar
- Agar izohda biron filmning 
- DIQQAT: Hech qanday qo'shtirnoq, yulduzcha (*), qavslar, raqamlash yoki qator tashlash ishlatma!
- DIQQAT: Hech qanday salomlashish yoki izoh ("Mana", "Ular" kabi) yozma! Mantiqan xato qilsang tizim portlaydi.
- Agar umuman topa olmasang, aynan "Film topilmadi" deb yoz.`;

            const groqResponse = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile", 
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userMessage }
                ],
                max_tokens: 150,
                temperature: 0.1,
            });

            const predictedText = groqResponse.choices?.[0]?.message?.content?.trim();

            if (!predictedText || predictedText.toLowerCase().includes("topilmadi")) {
                return [];
            }

            console.log(`🤖 [AI]: Groq topgan ehtimoliy kinolar ro'yxati: "${predictedText}"`);

            // Vergul bilan ajratilgan kinolarni alohida massivga ajaratamiz (split)
            const predictedNames = predictedText.split(",").map(n => n.trim()).filter(Boolean);

            // 🔥 Yaxshilanma: Ba'zan Groq qismlarini yozadi ("Qasoskorlar: Intiho") ammo DB da Asosiy ("Qasoskorlar") saqlangan.
            // Shuning uchun ": " va "-" belgilaridan oldingi Asosiy So'zlarni ham qidiruv jarayoniga qo'shamiz!
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

            const foundFilms = []; // Qaytariladigan oxirgi Array
            const foundIds = new Set(); // Turli nomlar bitta kinoni chaqirib qolsa dublikat bolmasligi uchun!

            // 2. QADAM: Har bir ehtimoliy kino nomi orqali LlamaIndex va Bazamizdan izlab yig'amiz!
            for (const pName of allTermsToSearch) {

                // a) DB dan izlab ko'ramiz
                const dbResults = await FilmService.searchByName(pName);

                if (dbResults && dbResults.length > 0) {
                    dbResults.forEach(film => {
                        const filmIdStr = (film._id || film.id).toString();
                        if (!foundIds.has(filmIdStr)) {
                            foundFilms.push({
                                name: film.name,
                                id: filmIdStr,
                                year: film.year,
                                code: film.code
                            });
                            foundIds.add(filmIdStr); // uni saqlandilar ro'yxatiga qo'shamiz
                        }
                    });
                }

                // b) LlamaIndex Vektor qidiruvidan ham so'rab olamiz (Agar Db dan topilsa ham ehtimoliy boshqalari ham chiqishi uchun)
                if (this.retriever) {
                    try {
                        const nodes = await this.retriever.retrieve({ query: pName });
                        if (nodes && nodes.length > 0) {
                            nodes.forEach(n => {
                                const mId = n.node.metadata.id;
                                // O'xshashlik 60% dan pastlarini va allaqachon DB dan topib qo'shilganlarini olmaymiz!
                                if (n.score >= 0.6 && !foundIds.has(mId)) {
                                    foundFilms.push({
                                        name: n.node.metadata.name,
                                        id: mId,
                                        year: null,
                                        code: null
                                    });
                                    foundIds.add(mId);
                                }
                            });
                        }
                    } catch (e) {
                        console.error("🤖 [AI]: LlamaIndex xatosi:", e.message);
                    }
                } else if (!this.retriever) {
                    this.init().catch(() => { });
                }
            }

            // 3. QADAM: Barcha mos kelgan kinolar yig'indisini Toza Array qilib qaytaramiz
            return foundFilms;

        } catch (error) {
            console.error("🤖 [AI]: AI bilan bog'lanishda xato:", error);
            return []; // Xatolik bo'lsa ham bo'sh array qaytsin (Frontend xatoga uchramasligi uchun)
        }
    }
}