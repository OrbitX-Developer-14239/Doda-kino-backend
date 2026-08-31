import { Schema } from "mongoose";
import { tenantModel } from "../core/tenant-context.js";

export const userSchema = new Schema({
    telegram_id: { type: String, required: true, unique: true },
    first_name: { type: String },
    username: { type: String },
    channels_condition: { type: Array, default: [] },

    // Foydalanuvchi botni bloklagan (Telegram 403 qaytargan).
    // Reklama tarqatishda bunday foydalanuvchilar butunlay o'tkazib
    // yuboriladi — aks holda har tarqatmada minglab befoyda so'rov ketardi.
    blocked: { type: Boolean, default: false },

    // Botga hech qachon YOZMAGAN foydalanuvchi. Bunday yozuvlar majburiy
    // obuna kanaliga qo'shilgan odamlardan paydo bo'ladi: bot ularni
    // bazaga yozadi, lekin Telegram qoidasi bo'yicha suhbatni BOT
    // boshlay olmaydi — copyMessage 400 "chat not found" qaytaradi.
    // Bir marta aniqlangach qayta urinilmaydi.
    unreachable: { type: Boolean, default: false },
}, { timestamps: true });

// Admin panelidagi foydalanuvchilar ro'yxati createdAt bo'yicha saralaydi,
// kanal statistikasi esa channels_condition bo'yicha filtrlaydi.
userSchema.index({ createdAt: -1 });
// Reklama tarqatish bloklanmaganlar bo'yicha yuradi
userSchema.index({ blocked: 1, unreachable: 1, _id: 1 });
userSchema.index({ "channels_condition.telegram_id": 1, "channels_condition.is_member": 1 });

// Sxema tenant-registry da har botning O'Z ulanishiga bog'lanadi.
// Bu proxy esa joriy so'rovning botiga qarab to'g'ri modelga yo'naltiradi —
// servislar kodi multibotga o'tishda o'zgarmasligi uchun.
export const UserModel = tenantModel("User");