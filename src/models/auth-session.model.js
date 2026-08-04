import { Schema } from "mongoose";
import { conn2 } from "../config/db.js";

/**
 * Telegram orqali kirish/ulash oqimida brauzerga beriladigan qisqa muddatli sessiya.
 *
 * Bu yozuv bo'lmasa `join_auth` socket xonasiga qo'shilishga ruxsat berilmaydi —
 * ilgari istalgan klient istalgan `auth_<matn>` xonasiga kira olardi.
 */
const AuthSessionSchema = new Schema({
    token: { type: String, required: true, unique: true },
    purpose: { type: String, enum: ["login", "link"], required: true },
    adminId: { type: Schema.Types.ObjectId, default: null },
    expiresAt: { type: Date, required: true }
}, { timestamps: true });

// MongoDB muddati o'tgan yozuvlarni o'zi o'chiradi
AuthSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AuthSessionModel = conn2.model("AuthSession", AuthSessionSchema);
