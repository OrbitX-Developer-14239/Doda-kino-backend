import { BotModel } from "../models/bot.model.js"

export const BotService = {
    async saveToken(token, username) {
        if (!token) {
            const error = new Error("Bot tokeni topilmadi!")
            error.status = 400
            throw error
        }
        if (!username) {
            const error = new Error("Bot username topilmadi!")
            error.status = 400
            throw error
        }

        const existToken = await BotModel.findOne({ token })

        if (existToken) {
            await BotModel.updateOne({ token }, { $set: { token, username } })
        } else {
            await BotModel.create({ token, username })
        }
        return { message: "Bot tokeni saqlandi!" }
    },

    async getToken() {
        return await BotModel.find()
    }
}