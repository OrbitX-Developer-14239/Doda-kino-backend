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

export const LogModel = conn2.model("Log", logSchema, "server_logs");
