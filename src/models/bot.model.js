import { model, Schema } from "mongoose";

const BotSchema = new Schema({
    token: { type: String, required: true },
    username: { type: String, required: true }
}, { timestamps: true })

export const BotModel = model("Bot", BotSchema)