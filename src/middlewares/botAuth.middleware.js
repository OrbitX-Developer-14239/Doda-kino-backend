import { BotModel } from "../models/bot.model.js";

export const botAuthMiddleware = () => {
    return async (req, res, next) => {
        try {
            const botToken = req.headers["x-bot-token"] || req.headers["x-bot-secret"] || req.body?.botToken || req.query?.botToken;

            if (!botToken) {
                return res.status(401).json({ success: false, message: "Bot tokeni yuborilmagan!" });
            }

            const bot = await BotModel.findOne();
            if (!bot || bot.token !== botToken) {
                return res.status(403).json({ success: false, message: "Ushbu botga ruxsat yo'q" });
            }

            next();
        } catch (error) {
            return res.status(500).json({ success: false, message: "Bot autentifikatsiya xatosi" });
        }
    };
};
