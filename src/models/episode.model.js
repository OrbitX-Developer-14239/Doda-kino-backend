import { Schema } from "mongoose";
import { conn1 } from "../config/db.js";

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
    releaseYear: { type: Number },
    country: { type: String },
    genres: [{ type: String }],
    videoFileId: { type: Schema.Types.Mixed, required: true },

    code: { type: Number, required: true, unique: true, index: true },

    filmId: { type: Schema.Types.ObjectId, ref: "Film", required: true },
    instagramPostId: { type: String },
    instagramUrl: { type: String },

    editVideos: [EditVideoSchema]
}, { timestamps: true });

export const EpisodeModel = conn1.model("Episode", EpisodeSchema);