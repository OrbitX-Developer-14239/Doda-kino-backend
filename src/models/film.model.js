import { Schema } from "mongoose";
import { conn1 } from "../config/db.js";

const FilmSchema = new Schema({
    // Diqqat: bu yerda ilgari ikkala maydonda alohida `index: 'text'` bor edi.
    // MongoDB bitta kolleksiyada faqat BITTA text indeksga ruxsat beradi, shuning
    // uchun ikkinchisi har ishga tushishda jimgina xato bilan tugardi.
    name: { type: String, required: true },
    originalName: { type: String, required: true },
    description: { type: String, required: true },
    // Qo'lda kiritilmaydi — epizod qo'shilganda/o'chirilganda avtomatik yangilanadi.
    episodesCount: { type: Number, default: 0 },
    year: { type: Number, required: true },
    country: { type: String, required: true },
    genres: [{ type: String, required: true }],

    code: { type: Number, required: true, unique: true, index: true },
    posterId: { type: Schema.Types.Mixed },
    views: { type: Number, default: 0 },

    episodes: [{
        _id: false,
        episodeId: { type: Schema.Types.ObjectId, ref: "Episode", required: true },
        episodeNumber: { type: Number, required: true },
        code: { type: Number, required: true },
        name: { type: String, required: true },
        description: { type: String },
        releaseYear: { type: Number },
        country: { type: String },
        genres: [{ type: String }],
        videoFileId: { type: Schema.Types.Mixed }
    }]
}, { timestamps: true });

// Bitta birlashtirilgan text indeks (nomlar bo'yicha qidiruv uchun)
FilmSchema.index({ name: "text", originalName: "text" });

// Ro'yxat va statistika sahifalari shu tartiblashlarni ishlatadi — indekssiz
// har so'rov butun kolleksiyani skanerlab, xotirada saralardi.
FilmSchema.index({ createdAt: -1 });
FilmSchema.index({ views: -1 });

export const FilmModel = conn1.model("Film", FilmSchema);