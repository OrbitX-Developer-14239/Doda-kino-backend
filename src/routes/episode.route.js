import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { EpisodeValidation } from "../validations/episode.validation.js";
import { EpisodeController } from "../controllers/episode.controller.js";
import { upload } from '../middlewares/upload.middleware.js';

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
router.post("/", upload.single('instagramVideo'), validate(EpisodeValidation), EpisodeController.createEpisode)

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
router.get("/code/:code", EpisodeController.searchByCode)

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
router.put("/:id", EpisodeController.updateEpisode)

export default router