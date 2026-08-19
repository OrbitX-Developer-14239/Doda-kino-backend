import { BotService } from "../services/bot.service.js";
import { catchAsync } from "../utils/catchAsync.js";

export const BotController = {
    getInfo: catchAsync(async (req, res) => {
        const data = await BotService.getBotInfo()

        if (!data) {
            return res.status(404).json({ success: false, message: "Bot topilmadi" })
        }

        res.status(200).json({ success: true, data })
    }),

    list: catchAsync(async (req, res) => {
        const data = await BotService.listBots()
        res.status(200).json({ success: true, data })
    })
}
