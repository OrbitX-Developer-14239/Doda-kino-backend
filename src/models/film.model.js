import { Schema, model } from "mongoose";

const FilmSchema = new Schema({
    name: { type: String, required: true, index: 'text' },
    originalName: { type: String, required: true, index: 'text' },
    description: { type: String, required: true },
    episodesCount: { type: Number, required: true },
    year: { type: Number, required: true },
    country: { type: String, required: true },
    genres: [{ type: String, required: true }],

    code: { type: Number, required: true, unique: true, index: true },
    posterId: { type: String },

    episodes: [{
        _id: false,
        episodeId: { type: Schema.Types.ObjectId, ref: "Episode", required: true },
        episodeNumber: { type: Number, required: true },
        code: { type: Number, required: true },
        name: { type: String, required: true },
        originalName: { type: String, required: true },
        description: { type: String },
        releaseYear: { type: Number },
        country: { type: String },
        genres: [{ type: String }]
    }]
}, { timestamps: true });

export const FilmModel = model("Film", FilmSchema);