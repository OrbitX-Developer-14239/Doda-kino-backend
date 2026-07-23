import { BotService } from "../services/bot.service.js";
import { catchAsync } from "../utils/catchAsync.js";

export const BotController = {
    saveToken: catchAsync(async (req, res) => {
        const data = await BotService.saveToken(req.body.token, req.body.username)

        res.status(201).json({ success: true, data })
    }),

    getToken: catchAsync(async (req, res) => {
        const data = await BotService.getToken()

        res.status(200).json(data)
    }),

    getInfo: catchAsync(async (req, res) => {
        const data = await BotService.getBotInfo()

        if (!data) {
            return res.status(404).json({ success: false, message: "Bot topilmadi" })
        }

        res.status(200).json({ success: true, data })
    })
}