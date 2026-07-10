import { Schema, model } from "mongoose";

const AdminSchema = new Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["superadmin", "admin"], required: true },
    isVerified: { type: Boolean, default: false },
    verifyToken: { type: String, default: null },
    refreshToken: { type: String, default: null },
    firstName: { type: String, default: null },
    lastName: { type: String, default: null },
    telegramUsername: { type: String, default: null },
    phoneNumber: { type: String, default: null },
    telegramId: { type: Number, default: null },
    telegramLoginTokenHash: { type: String, default: null },
    telegramLoginExpiresAt: { type: Date, default: null },
}, { timestamps: true })

export const AdminModel = model("Admin", AdminSchema)
