import { Schema } from "mongoose";
import { mainConn } from "../config/db.js";

/**
 * Botlar registri — qaysi botlar mavjudligi haqida ma'lumot.
 * TOKEN BU YERDA SAQLANMAYDI: u .env da turadi va faqat xotirada ishlatiladi.
 * Ilgari bot har ishga tushganda tokenini shu kolleksiyaga yuborardi —
 * multibotda bu olib tashlandi, backend botlarni .env dan o'zi biladi.
 */
const BotSchema = new Schema({
    botId: { type: Number, required: true, unique: true },
    username: { type: String, default: null },
}, { timestamps: true })

export const BotModel = mainConn.model("Bot", BotSchema)
