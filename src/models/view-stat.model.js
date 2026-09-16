import { Schema } from "mongoose";
import { tenantModel } from "../core/tenant-context.js";

/**
 * ============================================
 *  Kunlik ko'rishlar hisoblagichi
 * ============================================
 *
 * NEGA ALOHIDA TO'PLAM: film hujjatidagi `views` — bu shunchaki jami
 * hisoblagich. Undan "qaysi kuni necha marta ko'rilgan" degan savolga
 * javob chiqmaydi, ya'ni vaqt bo'yicha grafik qurib bo'lmaydi. Bu yerda
 * esa har kun uchun alohida qator turadi.
 *
 * QAYSI CLUSTERDA: data (foydalanuvchilar) clusterida, ya'ni HAR BOTDA
 * o'ziniki. Film hujjatidagi `views` kontent bazasida yotadi va uni
 * "Doda Kino" bilan "Mega Filmlar" BO'LISHADI — o'sha raqamdan qaysi
 * botda ko'rilgani bilinmaydi. Kunlik hisob esa bot bo'yicha ajratilgan
 * bo'lgani foydaliroq, qolaversa aralash botning (Doda Media) yoziladigan
 * kontent bazasi umuman yo'q.
 *
 * Bitta ko'rish = bitta `$inc` (upsert). Kuniga o'nlab ko'rish bo'lgani
 * uchun yuk sezilarsiz.
 */
export const viewStatSchema = new Schema({
    /** Toshkent vaqti bo'yicha "YYYY-MM-DD" */
    day: { type: String, required: true },

    kind: { type: String, enum: ["film", "episode"], required: true },

    /** Film yoki qism kodi (foydalanuvchi botga yozadigan raqam) */
    code: { type: Number, required: true },

    count: { type: Number, default: 0 },
}, { timestamps: true });

// Kun + tur + kod — yagona qator. $inc shu kalit bo'yicha upsert qiladi.
viewStatSchema.index({ day: 1, kind: 1, code: 1 }, { unique: true });

// Grafik so'rovi: berilgan kodlar bo'yicha oraliqdagi kunlar
viewStatSchema.index({ kind: 1, code: 1, day: 1 });

export const ViewStatModel = tenantModel("ViewStat");
