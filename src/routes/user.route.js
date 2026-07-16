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
 *     responses:
 *       200:
 *         description: List of users
 */
router.get("/", userController.getUsers)

export default router