import mongoose from "mongoose";
import { conn2 } from "../config/db.js";

const logSchema = new mongoose.Schema({
    timestamp: {
        type: Date,
        default: Date.now,
    },
    level: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    meta: {
        type: mongoose.Schema.Types.Mixed,
    }
}, { versionKey: false, timestamps: false });

// Loglar sahifasi vaqt + daraja + manba bo'yicha filtrlaydi va vaqt bo'yicha saralaydi
logSchema.index({ timestamp: -1, level: 1 });
logSchema.index({ "meta.source": 1, timestamp: -1 });

export const LogModel = conn2.model("Log", logSchema, "server_logs");
