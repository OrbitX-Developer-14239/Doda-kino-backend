import { Schema } from "mongoose";
import { tenantModel } from "../core/tenant-context.js";

/**
 * Bot a'zo bo'lgan kanal/guruhlar ro'yxati.
 *
 * NEGA ALOHIDA JADVAL KERAK:
 * Telegram Bot API da "bot qaysi chatlarda bor" degan metod YO'Q
 * (getChat, getChatMember — hammasi ID ni oldindan bilishni talab qiladi).
 * Shuning uchun ro'yxatni o'zimiz yig'ib boramiz: bot biror joyga
 * qo'shilganda/chiqarilganda/admin qilinganda Telegram `my_chat_member`
 * hodisasini yuboradi va bot uni shu yerga yozadi.
 *
 * Bu "nomzodlar" ro'yxati — obuna uchun ishlatiladigan haqiqiy kanallar
 * ChannelModel da. Admin shu ro'yxatdan tanlab ChannelModel ga qo'shadi.
 */
export const discoveredChatSchema = new Schema({
    telegram_id: { type: String, required: true, unique: true },
    title: { type: String, default: "" },
    username: { type: String, default: null },
    // channel | supergroup | group
    type: { type: String, default: "channel" },

    // Botning o'sha chatdagi holati: administrator | creator | member | left | kicked | restricted
    bot_status: { type: String, default: "member" },
    is_admin: { type: Boolean, default: false },
    can_invite_users: { type: Boolean, default: false },

    member_count: { type: Number, default: null },
    // Oxirgi marta qachon ma'lumot yangilangani
    last_seen: { type: Date, default: Date.now },
}, { timestamps: true });

discoveredChatSchema.index({ is_admin: -1, title: 1 });

// Sxema tenant-registry da har botning O'Z ulanishiga bog'lanadi.
// Bu proxy esa joriy so'rovning botiga qarab to'g'ri modelga yo'naltiradi —
// servislar kodi multibotga o'tishda o'zgarmasligi uchun.
export const DiscoveredChatModel = tenantModel("DiscoveredChat");
