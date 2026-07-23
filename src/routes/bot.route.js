import { Router } from "express";
import { BotController } from "../controllers/bot.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router()

router.post("/save", BotController.saveToken)

router.get("/get", authMiddleware(["superadmin", "admin"]), BotController.getToken)

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
 */

export default router