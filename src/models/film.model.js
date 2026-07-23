import { Schema } from "mongoose";
import { conn1 } from "../config/db.js";

const FilmSchema = new Schema({
    name: { type: String, required: true, index: 'text' },
    originalName: { type: String, required: true, index: 'text' },
    description: { type: String, required: true },
    episodesCount: { type: Number, required: true },
    year: { type: Number, required: true },
    country: { type: String, required: true },
    genres: [{ type: String, required: true }],

    code: { type: Number, required: true, unique: true, index: true },
    posterId: { type: Schema.Types.Mixed },

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

export const FilmModel = conn1.model("Film", FilmSchema);