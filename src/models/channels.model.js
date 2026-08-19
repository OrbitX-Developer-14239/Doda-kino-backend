import { Schema } from "mongoose";
import { tenantModel } from "../core/tenant-context.js";

export const channelSchema = new Schema({
    telegram_id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    invite_link: { type: String, required: false },
    join_type: { type: String, enum: ["request", "public"], default: "request" },
    is_active: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false },
    bot_permissions: { type: Object, default: null }
}, { timestamps: true });

// Sxema tenant-registry da har botning O'Z ulanishiga bog'lanadi.
// Bu proxy esa joriy so'rovning botiga qarab to'g'ri modelga yo'naltiradi —
// servislar kodi multibotga o'tishda o'zgarmasligi uchun.
export const ChannelModel = tenantModel("Channel");