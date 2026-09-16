import { Schema } from "mongoose";
import { tenantModel } from "../core/tenant-context.js";

/**
 * ============================================
 *  Majburiy kanalga qo'shilish / chiqish hodisasi
 * ============================================
 *
 * NEGA KERAK: foydalanuvchi hujjatidagi `channels_condition` faqat
 * HOZIRGI holatni saqlaydi (a'zomi yoki yo'q). Undan "10-sentyabrda
 * nechta odam qo'shilgan" degan savolga javob yo'q. Bu yerda esa har bir
 * o'zgarish alohida yozuv bo'lib qoladi va vaqt bo'yicha grafik chiqadi.
 *
 * "BOT ORQALI" nimani anglatadi: yozuv faqat BIZNING botimizning haqiqiy
 * foydalanuvchisi (started=true) uchun yaratiladi va o'zgarishni botning
 * o'zi ko'radi — u obuna tekshiruvida yoki kanaldagi chat_member
 * hodisasida aniqlanadi. Ya'ni botni umuman ochmagan, kanalga chetdan
 * kelgan odam bu hisobga tushmaydi.
 *
 * Tarix shu to'plam paydo bo'lgan kundan boshlab yig'iladi — undan
 * oldingi qo'shilishlar hech qayerda yozilmagan, ularni tiklab bo'lmaydi.
 */
export const channelEventSchema = new Schema({
    telegram_id: { type: String, required: true },

    channel_id: { type: String, required: true },

    /** Kanal keyin o'chirilsa ham grafikda nomi ko'rinib tursin */
    channel_name: { type: String },

    action: { type: String, enum: ["join", "leave"], required: true },
}, { timestamps: true });   // createdAt — hodisa vaqti

// Grafik: oraliq bo'yicha, kanal bo'yicha
channelEventSchema.index({ createdAt: -1 });
channelEventSchema.index({ channel_id: 1, createdAt: -1 });

export const ChannelEventModel = tenantModel("ChannelEvent");
