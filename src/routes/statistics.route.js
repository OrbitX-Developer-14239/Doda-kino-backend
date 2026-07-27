import { Router } from "express";
import { StatisticsController } from "../controllers/statistics.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Statistics
 *   description: Filmlar va epizodlar statistikasi
 */

/**
 * @swagger
 * /api/statistics/view:
 *   post:
 *     summary: Film yoki epizod ko'rishlar sonini bittaga oshirish
 *     tags: [Statistics]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - code
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [film, episode]
 *                 example: film
 *               code:
 *                 type: number
 *                 example: 50001
 *     responses:
 *       200:
 *         description: View muvaffaqiyatli qo'shildi
 */
router.post("/view", StatisticsController.addView);

/**
 * @swagger
 * /api/statistics/top:
 *   get:
 *     summary: Eng ko'p ko'rilgan film va epizodlarni olish
 *     tags: [Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Qancha natija qaytishi kerak
 *     responses:
 *       200:
 *         description: Eng ko'p ko'rilganlar ro'yxati
 */
router.get("/top", StatisticsController.getTop);

export default router;
