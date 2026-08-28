import mongoose from "mongoose";
import { mainConn } from "../config/db.js";

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

// TTL indeksini (7 kun) winston-mongodb O'ZI yaratadi va boshqaradi —
// muddat logger.js dagi "expireAfterSeconds" da belgilanadi.
//
// Uni bu yerda ham e'lon qilish MUMKIN EMAS: winston indeksni
// { timestamp: -1 } kaliti bilan, lekin "timestamp_1" nomi bilan yaratadi.
// Sxemadagi { timestamp: 1 } ham xuddi shu nomni talab qiladi va indeks
// yaratish "IndexOptionsConflict" bilan yiqiladi.
logSchema.index({ "meta.source": 1, timestamp: -1 });

export const LogModel = mainConn.model("Log", logSchema, "server_logs");
