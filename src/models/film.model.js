import { Schema } from "mongoose";
import { tenantModel } from "../core/tenant-context.js";

export const FilmSchema = new Schema({
    name: { type: String, required: true },
    originalName: { type: String, required: true },
    description: { type: String, required: true },
    episodesCount: { type: Number, default: 0 },
    // Fasllar soni. 1 (yoki ko'rsatilmagan) = oddiy film/serial: botda
    // qismlar to'g'ridan-to'g'ri chiqadi va "1-fasl" degan yozuv KO'RINMAYDI.
    // 2 va undan ko'p bo'lsa bot avval fasl tugmalarini ko'rsatadi.
    seasonsCount: { type: Number, default: 1, min: 1 },
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
        // Qaysi faslga tegishli (bir faslli filmlarda har doim 1)
        season: { type: Number, default: 1 },
        code: { type: Number, required: true },
        name: { type: String, required: true },
        description: { type: String },
        releaseYear: { type: Number },
        country: { type: String },
        genres: [{ type: String }],
        videoFileId: { type: Schema.Types.Mixed }
    }]
}, { timestamps: true });

FilmSchema.index({ name: "text", originalName: "text" });

FilmSchema.index({ createdAt: -1 });
FilmSchema.index({ views: -1 });

export const FilmModel = tenantModel("Film");