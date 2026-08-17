import { Router } from "express";
import { ChannelController } from "../controllers/channel.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { botOrAdmin } from "../middlewares/access.middleware.js";
import { botAuthMiddleware } from "../middlewares/botAuth.middleware.js";

const router = Router()

/**
 * @swagger
 * tags:
 *   name: Channels
 *   description: Channel management API
 */

/**
 * @swagger
 * /api/channel:
 *   post:
 *     summary: Create a new channel (auto generates invite link based on join_type)
 *     tags: [Channels]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [telegram_id, name]
 *             properties:
 *               telegram_id:
 *                 type: string
 *                 example: "-100123456789"
 *               name:
 *                 type: string
 *                 example: "DodaKino"
 *               join_type:
 *                 type: string
 *                 enum: [request, public]
 *                 example: "request"
 *               is_active:
 *                 type: boolean
 *                 example: true
 *               isPrivate:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Channel created successfully
 */
router.post("/", authMiddleware(["superadmin", "admin"]), ChannelController.createChannel)

/**
 * @swagger
 * /api/channel:
 *   get:
 *     summary: Get all channels
 *     tags: [Channels]
 *     responses:
 *       200:
 *         description: A list of channels
 */
router.get("/", botOrAdmin(["superadmin", "admin"]), ChannelController.getChannels)

/**
 * @swagger
 * /api/channel/available:
 *   get:
 *     summary: Bot a'zo bo'lgan kanal/guruhlar ro'yxati
 *     description: >
 *       Yangi kanal qo'shishdan oldin tanlash uchun ro'yxat. Har biri uchun
 *       telegram ID, nomi, turi va botning admin yoki oddiy a'zo ekani beriladi.
 *
 *       DIQQAT: Telegram Bot API "bot qaysi chatlarda bor" degan metod BERMAYDI.
 *       Shuning uchun ro'yxat uch manbadan yig'iladi: (1) bot `my_chat_member`
 *       hodisasi orqali topgan chatlar, (2) allaqachon qo'shilgan kanallar,
 *       (3) .env dagi CHANNEL_ID. Bot yangi joyga qo'shilsa ro'yxatga o'zi tushadi.
 *     tags: [Channels]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: refresh
 *         schema: { type: string, enum: ["true", "false"] }
 *         description: "false — Telegramga bormasdan faqat bazadagi holat (tezroq)"
 *     responses:
 *       200:
 *         description: Ro'yxat
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       telegram_id:   { type: string, example: "-1003831468244" }
 *                       title:         { type: string, example: "Doda Kino" }
 *                       username:      { type: string, nullable: true }
 *                       type:          { type: string, example: "channel" }
 *                       bot_status:    { type: string, example: "administrator" }
 *                       is_admin:      { type: boolean, example: true }
 *                       can_invite_users: { type: boolean }
 *                       member_count:  { type: integer, nullable: true }
 *                       already_added: { type: boolean, description: "Obuna kanali sifatida qo'shilganmi" }
 */
router.get("/available", authMiddleware(["superadmin", "admin"]), ChannelController.getAvailableChats)

// Ichki endpoint — faqat bot chaqiradi (`my_chat_member` hodisasida).
// Swagger hujjatiga ataylab kiritilmagan: u admin panel uchun mo'ljallangan,
// bu esa bot-backend orasidagi xizmat yo'li.
router.post("/discovered", botAuthMiddleware(), ChannelController.syncDiscoveredChat)

/**
 * @swagger
 * /api/channel/{id}:
 *   get:
 *     summary: Get channel by ID and its statistics
 *     tags: [Channels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Channel retrieved successfully with stats
 *       404:
 *         description: Channel not found
 */
router.get("/:id", authMiddleware(["superadmin", "admin"]), ChannelController.getChannelById)

/**
 * @swagger
 * /api/channel/{id}:
 *   put:
 *     summary: Update a channel (regenerates invite_link if join_type changes)
 *     tags: [Channels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               join_type:
 *                 type: string
 *                 enum: [request, public]
 *               is_active:
 *                 type: boolean
 *               isPrivate:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Channel updated successfully
 */
router.put("/:id", authMiddleware(["superadmin", "admin"]), ChannelController.updateChannel)

/**
 * @swagger
 * /api/channel/{id}:
 *   delete:
 *     summary: Delete a channel
 *     tags: [Channels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Channel deleted successfully
 */
router.delete("/:id", authMiddleware(["superadmin", "admin"]), ChannelController.deleteChannel)

export default router