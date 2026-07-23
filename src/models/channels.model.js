import { Schema } from "mongoose";
import { conn1 } from "../config/db.js";

const channelSchema = new Schema({
    telegram_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    invite_link: { type: String, required: false },
    join_type: { type: String, enum: ["request", "public"], default: "request" },
    is_active: { type: Boolean, default: false },
    bot_permissions: { type: Object, default: null }
}, { timestamps: true });

export const ChannelModel = conn1.model("Channel", channelSchema);