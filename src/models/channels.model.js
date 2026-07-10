import { Schema, model } from "mongoose";

const channelSchema = new Schema({
    telegram_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    invite_link: { type: String, required: true },
    is_active: { type: Boolean, default: false },
    bot_permissions: { type: Object, default: null }
}, { timestamps: true });

export const ChannelModel = model("Channel", channelSchema);