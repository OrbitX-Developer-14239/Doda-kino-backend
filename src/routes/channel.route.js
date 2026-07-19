import { Router } from "express";
import { ChannelController } from "../controllers/channel.controller.js";

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
 *     summary: Create a new channel
 *     tags: [Channels]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [telegram_id, name, invite_link]
 *             properties:
 *               telegram_id:
 *                 type: string
 *                 example: "123456789"
 *               name:
 *                 type: string
 *                 example: "DodaKino"
 *               invite_link:
 *                 type: string
 *                 example: "https://t.me/dodakino"
 *               is_active:
 *                 type: boolean
 *                 example: true
 *               bot_permissions:
 *                 type: object
 *     responses:
 *       200:
 *         description: Channel created successfully
 */
router.post("/", ChannelController.createChannel)

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
router.get("/", ChannelController.getChannels)

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
router.get("/:id", ChannelController.getChannelById)

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
router.delete("/:id", ChannelController.deleteChannel)

export default router