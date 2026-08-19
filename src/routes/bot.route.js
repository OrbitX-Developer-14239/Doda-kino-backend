import { Router } from "express";
import { BotController } from "../controllers/bot.controller.js";
import { botOrAdmin } from "../middlewares/access.middleware.js";

const router = Router()

/**
 * @swagger
 * /api/bot/info:
 *   get:
 *     summary: Get Bot Public Info
 *     description: >
 *       Joriy botning (URL dagi botId yoki asosiy bot) ID va username i.
 *       Token hech qachon qaytarilmaydi. Eslatma: /api/bot/save endpointi
 *       olib tashlangan — tokenlar endi .env da turadi, bot ularni yubormaydi.
 *     tags: [Bot]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bot info
 *       404:
 *         description: Bot not found
 *
 * /api/bot/list:
 *   get:
 *     summary: List all configured bots
 *     tags: [Bot]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bots list
 */

router.get("/info", botOrAdmin(["superadmin", "admin"]), BotController.getInfo)

router.get("/list", botOrAdmin(["superadmin", "admin"]), BotController.list)

export default router
