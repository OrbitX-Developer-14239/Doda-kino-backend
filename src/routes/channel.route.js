import { Router } from "express";
import { ChannelController } from "../controllers/channel.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { botOrAdmin } from "../middlewares/access.middleware.js";

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