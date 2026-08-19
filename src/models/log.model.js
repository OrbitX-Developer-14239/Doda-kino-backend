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

// 60 kundan eski loglarni MongoDB o'zi o'chiradi — aks holda 512 MB lik
// bepul clusterda birinchi bo'lib loglar joyni to'ldirardi.
logSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });
logSchema.index({ "meta.source": 1, timestamp: -1 });

export const LogModel = mainConn.model("Log", logSchema, "server_logs");
