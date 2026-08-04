import { Router } from "express";
import { BotController } from "../controllers/bot.controller.js";
import { botRegisterAuth } from "../middlewares/access.middleware.js";
import { botOrAdmin } from "../middlewares/access.middleware.js";

const router = Router()

/**
 * @swagger
 * /api/bot/save:
 *   post:
 *     summary: Register or replace the bot token
 *     description: >
 *       Birinchi o'rnatishda (bazada bot yo'q bo'lganda) ochiq bajariladi.
 *       Keyinchalik amaldagi `x-bot-token` header yoki superadmin JWT talab qilinadi.
 *       Javobda token HECH QACHON qaytarilmaydi.
 *     tags: [Bot]
 *     responses:
 *       201:
 *         description: Bot token saved
 *       403:
 *         description: Not allowed
 *
 * /api/bot/info:
 *   get:
 *     summary: Get Bot Public Info
 *     description: Returns the bot ID and username without exposing the token
 *     tags: [Bot]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bot info
 *       404:
 *         description: Bot not found
 */

router.post("/save", botRegisterAuth(), BotController.saveToken)

router.get("/info", botOrAdmin(["superadmin", "admin"]), BotController.getInfo)

export default router
