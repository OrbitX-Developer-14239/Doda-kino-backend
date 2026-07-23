import { Router } from "express";
import { BotController } from "../controllers/bot.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router()

router.post("/save", BotController.saveToken)

router.get("/get", BotController.getToken)

router.get("/info", BotController.getInfo)

/**
 * @swagger
 * /api/bot/get:
 *   get:
 *     summary: Get Bot Tokens
 *     tags: [Bot]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of bot tokens
 * 
 * /api/bot/info:
 *   get:
 *     summary: Get Bot Public Info
 *     description: Returns the bot ID and username without exposing the token
 *     tags: [Bot]
 *     responses:
 *       200:
 *         description: Bot info
 *       404:
 *         description: Bot not found
 */

export default router