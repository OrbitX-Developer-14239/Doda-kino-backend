import { Router } from "express";
import { StatisticsController } from "../controllers/statistics.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { botOrAdmin } from "../middlewares/access.middleware.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Statistics
 *   description: Filmlar va epizodlar statistikasi
 */

router.post("/view", botOrAdmin(["superadmin", "admin"]), StatisticsController.addView);

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
router.get("/", authMiddleware(["superadmin", "admin"]), StatisticsController.getAll);

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
router.get("/top", authMiddleware(["superadmin", "admin"]), StatisticsController.getTop);

/**
 * @swagger
 * /api/statistics/users-growth:
 *   get:
 *     summary: Foydalanuvchilar o'sishi (grafik uchun kunlik nuqtalar)
 *     description: >
 *       Faqat botga o'zi yozgan foydalanuvchilar sanaladi (started=true).
 *       Kanal orqali paydo bo'lgan yozuvlar grafikni buzmasligi uchun faqat
 *       totals.records da raqam sifatida qaytadi. Yangi foydalanuvchi
 *       bo'lmagan kunlar ham nol bilan to'ldiriladi. Kunlar Toshkent vaqtida.
 *     tags: [Statistics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: range
 *         schema:
 *           type: string
 *           enum: ["7", "30", "90", "all"]
 *           default: "30"
 *     responses:
 *       200:
 *         description: >
 *           data.points: [{ date, newStarted, newActive, totalStarted, totalActive }],
 *           data.totals: { records, started, active, blocked }
 *       400:
 *         description: Noto'g'ri range
 */
router.get("/users-growth", authMiddleware(["superadmin", "admin"]), StatisticsController.getUsersGrowth);

export default router;
