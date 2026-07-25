import { Router } from "express";
import { userController } from "../controllers/user.controller.js";

const router = Router()

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User management
 */

router.post("/", userController.createUser)
router.put("/", userController.updateUser)

/**
 * @swagger
 * /api/user:
 *   get:
 *     summary: Get all users
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: is_subscribed
 *         schema:
 *           type: boolean
 *         description: Filter by subscribed users (true|false)
 *       - in: query
 *         name: channel_id
 *         schema:
 *           type: string
 *         description: Filter by users currently subscribed to a specific channel (e.g. -1001373821225)
 *     responses:
 *       200:
 *         description: List of users
 */
router.get("/", userController.getUsers)

/**
 * @swagger
 * /api/user/{telegram_id}:
 *   get:
 *     summary: Get a single user by telegram_id
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: telegram_id
 *         required: true
 *         schema:
 *           type: string
 *         description: The Telegram ID of the user
 *     responses:
 *       200:
 *         description: User found successfully
 *       404:
 *         description: User not found
 */
router.get("/:telegram_id", userController.getUserByTelegramId)

export default router