import { Schema } from "mongoose";
import { conn2 } from "../config/db.js";

const userSchema = new Schema({
    telegram_id: { type: String, required: true, unique: true },
    first_name: { type: String },
    username: { type: String },
    channels_condition: { type: Array, default: [] }
}, { timestamps: true });

// Admin panelidagi foydalanuvchilar ro'yxati createdAt bo'yicha saralaydi,
// kanal statistikasi esa channels_condition bo'yicha filtrlaydi.
userSchema.index({ createdAt: -1 });
userSchema.index({ "channels_condition.telegram_id": 1, "channels_condition.is_member": 1 });

export const UserModel = conn2.model("User", userSchema);