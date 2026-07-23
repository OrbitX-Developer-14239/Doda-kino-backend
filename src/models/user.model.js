import { Schema } from "mongoose";
import { conn2 } from "../config/db.js";

const userSchema = new Schema({
    telegram_id: { type: String, required: true, unique: true },
    first_name: { type: String },
    username: { type: String },
    channels_condition: { type: Array, default: [] }
}, { timestamps: true });

export const UserModel = conn2.model("User", userSchema);