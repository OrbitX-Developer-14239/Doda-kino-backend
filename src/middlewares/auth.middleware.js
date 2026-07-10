import jwt from "jsonwebtoken";
import { AdminModel } from "../models/admin.model.js";

const JWT_SECRET = process.env.JWT_SECRET || "asil_secret_jwt_key";

export const authMiddleware = (roles = []) => {
    return async (req, res, next) => {
        try {
            const token = req.headers.authorization?.split(" ")[1];
            if (!token) {
                return res.status(401).json({ success: false, message: "Avtorizatsiya tokeni topilmadi!" });
            }

            const decoded = jwt.verify(token, JWT_SECRET);
            const admin = await AdminModel.findById(decoded.id);

            if (!admin) {
                return res.status(401).json({ success: false, message: "Bunday foydalanuvchi tizimda yo'q" });
            }

            if (!admin.isVerified) {
                return res.status(403).json({ success: false, message: "Profilingiz hali Telegram orqali tasdiqlanmagan!" });
            }

            if (roles.length && !roles.includes(admin.role)) {
                return res.status(403).json({ success: false, message: "Sizda ushbu amalni bajarish uchun huquq / ruxsat yo'q" });
            }

            req.admin = admin; // Keyingi controllerlar admin kimligini bilib olishi uchun
            next();
        } catch (error) {
            return res.status(401).json({ success: false, message: "Berilgan token yaroqsiz yoki muddati o'tgan" });
        }
    }
}
