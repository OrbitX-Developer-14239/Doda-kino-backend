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
 * /api/instagram/profile:
 *   put:
 *     summary: Update Instagram Profile Data (Local Simulation)
 *     tags: [Instagram]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.put("/profile", authMiddleware(["superadmin", "admin"]), InstagramController.updateProfile);

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
 * /api/instagram/statistics/posts:
 *   get:
 *     summary: Get Statistics for Posts (likes, comments, reach, best posts)
 *     tags: [Instagram]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Bar/Pie chart formats and Top Posts data
 */
router.get("/statistics/posts", authMiddleware(["superadmin", "admin"]), InstagramController.getPostStats);

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

/**
 * @swagger
 * /api/instagram/stories/{id}:
 *   delete:
 *     summary: Delete a Story
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
 *         description: Story deleted successfully
 */
router.delete("/stories/:id", authMiddleware(["superadmin", "admin"]), InstagramController.deleteStory);

export default router;
