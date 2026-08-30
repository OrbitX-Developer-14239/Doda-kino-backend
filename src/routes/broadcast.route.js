import { Router } from "express";
import { BroadcastController } from "../controllers/broadcast.controller.js";
import { anyBotOrAdmin } from "../middlewares/access.middleware.js";

const router = Router();

/**
 * Reklama tarqatish.
 *
 * Bu yo'llar ATAYLAB tenant middleware'dan TASHQARIDA turadi: bitta
 * tarqatma bir nechta botning foydalanuvchilarini qamraydi, ya'ni u
 * hech qaysi botga alohida tegishli emas.
 */

/**
 * @swagger
 * /api/broadcast/targets:
 *   get:
 *     summary: Reklama yuborish mumkin bo'lgan botlar ro'yxati
 *     tags: [Broadcast]
 *     responses:
 *       200:
 *         description: Botlar va ularning foydalanuvchi soni
 *
 * /api/broadcast:
 *   post:
 *     summary: Yangi reklama tarqatmasini boshlash
 *     tags: [Broadcast]
 *     responses:
 *       201:
 *         description: Tarqatma yaratildi va fonda boshlandi
 *   get:
 *     summary: Oxirgi tarqatmalar
 *     tags: [Broadcast]
 *     responses:
 *       200:
 *         description: Ro'yxat
 *
 * /api/broadcast/{id}/cancel:
 *   post:
 *     summary: Tarqatmani bekor qilish (qolgan takrorlar bajarilmaydi)
 *     tags: [Broadcast]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bekor qilindi
 */

router.get("/targets", anyBotOrAdmin(["superadmin", "admin"]), BroadcastController.listTargets);
router.post("/", anyBotOrAdmin(["superadmin", "admin"]), BroadcastController.create);
router.get("/", anyBotOrAdmin(["superadmin", "admin"]), BroadcastController.list);
router.post("/:id/cancel", anyBotOrAdmin(["superadmin", "admin"]), BroadcastController.cancel);

export default router;
