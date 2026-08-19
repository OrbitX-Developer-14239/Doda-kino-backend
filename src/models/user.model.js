import { Schema } from "mongoose";
import { tenantModel } from "../core/tenant-context.js";

export const userSchema = new Schema({
    telegram_id: { type: String, required: true, unique: true },
    first_name: { type: String },
    username: { type: String },
    channels_condition: { type: Array, default: [] }
}, { timestamps: true });

// Admin panelidagi foydalanuvchilar ro'yxati createdAt bo'yicha saralaydi,
// kanal statistikasi esa channels_condition bo'yicha filtrlaydi.
userSchema.index({ createdAt: -1 });
userSchema.index({ "channels_condition.telegram_id": 1, "channels_condition.is_member": 1 });

// Sxema tenant-registry da har botning O'Z ulanishiga bog'lanadi.
// Bu proxy esa joriy so'rovning botiga qarab to'g'ri modelga yo'naltiradi —
// servislar kodi multibotga o'tishda o'zgarmasligi uchun.
export const UserModel = tenantModel("User");