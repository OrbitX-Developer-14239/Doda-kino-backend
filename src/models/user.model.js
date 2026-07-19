import { Schema, model } from "mongoose";

const userSchema = new Schema({
    telegram_id: { type: String, required: true, unique: true },
    first_name: { type: String },
    username: { type: String },
    channels_condition: { type: Array, default: [] }
}, { timestamps: true });

export const UserModel = model("User", userSchema);