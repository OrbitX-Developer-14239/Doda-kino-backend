import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { EpisodeValidation } from "../validations/episode.validation.js";
import { EpisodeController } from "../controllers/episode.controller.js";
import { upload } from '../middlewares/upload.middleware.js';
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { botOrAdmin } from "../middlewares/access.middleware.js";
import { uploadLimiter } from "../middlewares/rateLimit.middleware.js";

const router = Router()

/**
 * @swagger
 * tags:
 *   name: Episodes
 *   description: Episode management and search
 */

/**
 * @swagger
 * /api/episode:
 *   post:
 *     summary: Create an episode
 *     tags: [Episodes]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [filmId, code, episodeNumber, name, videoFileId]
 *             properties:
 *               instagramVideo:
 *                 type: string
 *                 format: binary
 *               filmId:
 *                 type: string
 *                 example: "507f1f77bcf86cd799439011"
 *               code:
 *                 type: integer
 *                 example: 101
 *               episodeNumber:
 *                 type: integer
 *                 example: 1
 *               name:
 *                 type: string
 *                 example: "1-qism"
 *               videoFileId:
 *                 type: object
 *                 properties:
 *                   channelId:
 *                     type: string
 *                     example: "3831468244"
 *                   msgId:
 *                     type: integer
 *                     example: 4
 *               description:
 *                 type: string
 *                 example: "Qism haqida qisqacha"
 *               releaseYear:
 *                 type: integer
 *                 example: 2024
 *               country:
 *                 type: string
 *                 example: "US"
 *               caption:
 *                 type: string
 *                 example: "Qism uchun caption"
 *               genres:
 *                 type: array
 *                 items:
 *                   type: string
 *               editVideos:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Episode created successfully
 */
router.post("/", authMiddleware(["superadmin", "admin"]), uploadLimiter, upload.single('instagramVideo'), validate(EpisodeValidation), EpisodeController.createEpisode)

/**
 * @swagger
 * /api/episode/code/{code}:
 *   get:
 *     summary: Search episode by numeric code
 *     tags: [Episodes]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Episode retrieved successfully
 */
router.get("/code/:code", botOrAdmin(["superadmin", "admin"]), EpisodeController.searchByCode)

/**
 * @swagger
 * /api/episode/{id}:
 *   put:
 *     summary: Update an episode's text data
 *     tags: [Episodes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Episode Database ID (_id)
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: integer
 *               episodeNumber:
 *                 type: integer
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               releaseYear:
 *                 type: integer
 *               country:
 *                 type: string
 *               genres:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Episode updated successfully
 *       404:
 *         description: Episode not found
 */
router.put("/:id", authMiddleware(["superadmin", "admin"]), EpisodeController.updateEpisode)

/**
 * @swagger
 * /api/episode/{id}:
 *   delete:
 *     summary: Delete an episode by ID (or by code)
 *     description: >
 *       Epizodni bazadan o'chiradi va filmning `episodes` massivi hamda `episodesCount`
 *       ni bitta atomik so'rovda yangilaydi.
 *       `id` o'rniga epizod `code` ini ham berish mumkin (masalan `54001`).
 *       Diqqat: Telegram kanalidagi video xabar va Instagram Reels o'chirilmaydi.
 *     tags: [Episodes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Episode `_id` (24 belgili ObjectId) yoki epizod `code` i
 *         schema:
 *           type: string
 *           example: "507f1f77bcf86cd799439011"
 *     responses:
 *       200:
 *         description: Episode deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Epizod muvaffaqiyatli o'chirildi"
 *                     id:
 *                       type: string
 *                       example: "507f1f77bcf86cd799439011"
 *                     code:
 *                       type: number
 *                       example: 54001
 *       400:
 *         description: Noto'g'ri ID yoki kod formati
 *       401:
 *         description: Avtorizatsiya talab qilinadi
 *       404:
 *         description: Episode not found
 */
router.delete("/:id", authMiddleware(["superadmin", "admin"]), EpisodeController.deleteEpisode)

export default router