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

router.post("/view", StatisticsController.addView);

/**
 * @swagger
 * /api/statistics:
 *   get:
 *     summary: Barcha film va epizodlar statistikasini olish
 *     tags: [Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Sahifa raqami (20 tadan pagination)
 *     responses:
 *       200:
 *         description: Barcha film va epizodlar ro'yxati (pagination bilan)
 */
router.get("/", StatisticsController.getAll);

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
 *         name: top
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Jami nechta eng zo'rlarini ro'yxatga kiritish kerak (masalan 100 ta)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Sahifa raqami (shulardan 20 tasini ko'rsatadi)
 *     responses:
 *       200:
 *         description: Eng ko'p ko'rilganlar ro'yxati (pagination bilan)
 */
router.get("/top", StatisticsController.getTop);

export default router;
