import { Router } from "express";
import { InstagramController } from "../controllers/instagram.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/upload.middleware.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Instagram
 *   description: Instagram API Integration
 */

/**
 * @swagger
 * /api/instagram/profile:
 *   get:
 *     summary: Get Instagram Profile Data
 *     tags: [Instagram]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile data retrieved successfully
 */
router.get("/profile", authMiddleware(["superadmin", "admin"]), InstagramController.getProfile);

/**
 * @swagger
 * /api/instagram/growth:
 *   get:
 *     summary: Get Profile Growth Dynamics for Charts
 *     tags: [Instagram]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dynamics data returned for chart
 */
router.get("/growth", authMiddleware(["superadmin", "admin"]), InstagramController.getProfileGrowth);

/**
 * @swagger
 * /api/instagram/posts:
 *   get:
 *     summary: Get Statistics for Posts (likes, comments, reach, best posts)
 *     tags: [Instagram]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bar/Pie chart formats and Top Posts data
 */
router.get("/posts", authMiddleware(["superadmin", "admin"]), InstagramController.getPostStats);

/**
 * @swagger
 * /api/instagram/posts/{id}:
 *   get:
 *     summary: Get single post by id
 *     tags: [Instagram]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Full details of a single post
 */
router.get("/posts/:id", authMiddleware(["superadmin", "admin"]), InstagramController.getPostById);

/**
 * @swagger
 * /api/instagram/stories:
 *   get:
 *     summary: Get Currently Active Stories
 *     tags: [Instagram]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of stories
 */
router.get("/stories", authMiddleware(["superadmin", "admin"]), InstagramController.getStories);

/**
 * @swagger
 * /api/instagram/stories:
 *   post:
 *     summary: Upload a new Story (Image or Video File)
 *     tags: [Instagram]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               media:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Story uploaded 
 */
router.post("/stories", authMiddleware(["superadmin", "admin"]), upload.single('media'), InstagramController.uploadStory);

export default router;
