import { Schema } from "mongoose";
import { mainConn } from "../config/db.js";

/**
 * ============================================
 *  Reklama tarqatmasi (broadcast)
 * ============================================
 *
 * MAIN clusterda saqlanadi, chunki bitta tarqatma BIR NECHTA botning
 * foydalanuvchilariga ketishi mumkin — ya'ni u hech qaysi botning
 * shaxsiy bazasiga tegishli emas.
 *
 * Post NUSXALANADI (copyMessage), forward qilinmaydi: shunda xabar
 * ustida "Forwarded from" yozuvi chiqmaydi va reklama botning o'z
 * xabaridek ko'rinadi.
 *
 * Ish holati bazada turadi — server qayta ishga tushsa ham takroriy
 * yuborishlar (masalan "5 marta, 2 soatda bir") joyidan davom etadi.
 */
const RunSchema = new Schema({
    startedAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    blocked: { type: Number, default: 0 },
    // Har bot bo'yicha alohida: { botId, sent, failed, blocked }
    perBot: { type: Array, default: [] },
}, { _id: false });

const BroadcastSchema = new Schema({
    // Reklama posti qayerda turibdi
    sourceChatId: { type: String, required: true },
    sourceMessageId: { type: Number, required: true },

    // Qaysi botlarning foydalanuvchilariga yuboriladi
    botIds: [{ type: Number, required: true }],

    totalRuns: { type: Number, required: true, min: 1 },
    // Takrorlar orasidagi vaqt (soat). Bir marta bo'lsa 0.
    intervalHours: { type: Number, required: true, min: 0 },

    runsDone: { type: Number, default: 0 },
    nextRunAt: { type: Date, required: true },

    status: {
        type: String,
        enum: ["pending", "running", "done", "cancelled"],
        default: "pending",
    },

    // Kim boshlagani (kanal administratori)
    createdBy: { type: Object, default: null },

    // Hisobotni kim yozadi. Reklama kanaliga javob qaytarish uchun
    // O'SHA kanalda turgan bot kerak — tarqatmani boshlagan bot.
    reporterBotId: { type: Number, default: null },

    runs: { type: [RunSchema], default: [] },
}, { timestamps: true });

// Rejalashtiruvchi har daqiqada "muddati kelganlar"ni shu indeks bilan topadi
BroadcastSchema.index({ status: 1, nextRunAt: 1 });

export const BroadcastModel = mainConn.model("Broadcast", BroadcastSchema);
