import { Schema } from "mongoose";
import { tenantModel } from "../core/tenant-context.js";

const EditVideoSchema = new Schema({
    videoUrl: { type: String, required: true },
    instagram: {
        isPublished: { type: Boolean, default: false },
        postId: { type: String, default: null },
        caption: { type: String, default: "" }
    }
}, { _id: true });

export const EpisodeSchema = new Schema({
    name: { type: String, required: true },
    description: { type: String },
    episodeNumber: { type: Number, required: true },
    // Fasl raqami. Bir faslli filmlarda 1 bo'lib qolaveradi.
    season: { type: Number, default: 1, min: 1 },
    releaseYear: { type: Number },
    country: { type: String },
    genres: [{ type: String }],
    videoFileId: { type: Schema.Types.Mixed, required: true },

    code: { type: Number, required: true, unique: true, index: true },

    filmId: { type: Schema.Types.ObjectId, ref: "Film", required: true },
    instagramPostId: { type: String },
    instagramUrl: { type: String },
    views: { type: Number, default: 0 },

    editVideos: [EditVideoSchema]
}, { timestamps: true });

// Film o'chirilganda `deleteMany({ filmId })` va qism ro'yxatlari shu maydondan foydalanadi
EpisodeSchema.index({ filmId: 1, season: 1, episodeNumber: 1 });
EpisodeSchema.index({ views: -1 });

// Sxema tenant-registry da har botning O'Z ulanishiga bog'lanadi.
// Bu proxy esa joriy so'rovning botiga qarab to'g'ri modelga yo'naltiradi —
// servislar kodi multibotga o'tishda o'zgarmasligi uchun.
export const EpisodeModel = tenantModel("Episode");