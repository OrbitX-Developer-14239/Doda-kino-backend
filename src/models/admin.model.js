import { Schema } from "mongoose";
import { mainConn } from "../config/db.js";

const AdminSchema = new Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["superadmin", "admin"], required: true },
    isVerified: { type: Boolean, default: false },
    verifyToken: { type: String, default: null },
    /**
     * ESKI maydon — faqat moslik uchun qoldirilgan.
     * Yangi sessiyalar `refreshTokens` ga yoziladi; bu yerdagi qiymat
     * o'zgartirish chiqarilgan paytda ochiq turgan sessiyalar birdaniga
     * uzilib qolmasligi uchun hali ham qabul qilinadi.
     */
    refreshToken: { type: String, default: null },

    /**
     * FAOL SESSIYALAR.
     *
     * Ilgari refresh token BITTA maydonda turardi va har login uni
     * ustidan yozardi. Natijada ikkinchi qurilmadan (yoki hatto
     * skriptdan) kirilsa, birinchi sessiyaning tokeni yaroqsiz bo'lib
     * qolardi — va access token muddati tugashi bilan, ya'ni 15
     * daqiqadan keyin, panel foydalanuvchini login sahifasiga otardi.
     * Tashqaridan bu "refresh umuman ishlamayapti" bo'lib ko'rinardi.
     */
    refreshTokens: {
        type: [{
            _id: false,
            token: { type: String, required: true },
            createdAt: { type: Date, default: Date.now },
            expiresAt: { type: Date, required: true },
        }],
        default: [],
    },
    firstName: { type: String, default: null },
    lastName: { type: String, default: null },
    telegramUsername: { type: String, default: null },
    phoneNumber: { type: String, default: null },
    telegramId: { type: Number, default: null },
    telegramLoginTokenHash: { type: String, default: null },
    telegramLoginExpiresAt: { type: Date, default: null },
    telegramAuthSessionToken: { type: String, default: null },
    telegramLinkTokenHash: { type: String, default: null },
    telegramLinkExpiresAt: { type: Date, default: null },
}, { timestamps: true })

export const AdminModel = mainConn.model("Admin", AdminSchema)
