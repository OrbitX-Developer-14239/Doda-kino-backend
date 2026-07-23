import { Schema } from "mongoose";
import { conn2 } from "../config/db.js";

const BotSchema = new Schema({
    token: { type: String, required: true },
    botId: { type: Number, required: true },
    username: { type: String, required: true }
}, { timestamps: true })

export const BotModel = conn2.model("Bot", BotSchema)