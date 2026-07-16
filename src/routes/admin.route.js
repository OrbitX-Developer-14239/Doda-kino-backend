import { Router } from "express";
import { AdminController } from "../controllers/admin.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminUpdateValidation, adminValidation } from "../validations/admin.validation.js";
import { validate } from "../middlewares/validate.middleware.js";
import { botAuthMiddleware } from "../middlewares/botAuth.middleware.js";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin management and authentication
 */

/**
 * @swagger
 * /api/admin/login:
 *   post:
 *     summary: Admin login
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: "admin"
 *               password:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login successful
 */
router.post("/login", validate(adminValidation), AdminController.login);

/**
 * @swagger
 * /api/admin/verify/{token}:
 *   post:
 *     summary: Verify admin login by token
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Verified successfully
 */
router.post("/verify/:token", AdminController.verifyAdmin);

router.post("/verify-bot", botAuthMiddleware(), AdminController.verifyAdminByBot);

router.post("/telegram-login", botAuthMiddleware(), AdminController.requestTelegramLogin);

/**
 * @swagger
 * /api/admin/telegram-login-link:
 *   post:
 *     summary: Request Telegram login by contact
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "+998901234567"
 *     responses:
 *       200:
 *         description: Contact link processed
 */
router.post("/telegram-login-link", botAuthMiddleware(), AdminController.requestTelegramLoginByContact);

router.post("/telegram-auth", AdminController.telegramAuth);

/**
 * @swagger
 * /api/admin/create:
 *   post:
 *     summary: Create new admin
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: "newadmin"
 *               password:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       201:
 *         description: Admin created
 */
router.post("/create", authMiddleware(["superadmin"]), validate(adminValidation), AdminController.createAdmin);
/**
 * @swagger
 * /api/admin/{id}:
 *   put:
 *     summary: Update an admin
 *     tags: [Admin]
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
 *         description: Admin updated
 */
router.put("/:id", authMiddleware(["superadmin", "admin"]), validate(adminUpdateValidation), AdminController.updateAdmin);

/**
 * @swagger
 * /api/admin/{id}:
 *   delete:
 *     summary: Delete an admin
 *     tags: [Admin]
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
 *         description: Admin deleted
 */
router.delete("/:id", authMiddleware(["superadmin"]), AdminController.deleteAdmin);

/**
 * @swagger
 * /api/admin/refresh:
 *   post:
 *     summary: Refresh JWT token
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Token refreshed
 */
router.post("/refresh", AdminController.refresh);

/**
 * @swagger
 * /api/admin/logout:
 *   post:
 *     summary: Logout admin
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 */
router.post("/logout", authMiddleware(), AdminController.logout);

/**
 * @swagger
 * /api/admin/all:
 *   get:
 *     summary: Get all admins
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of admins
 */
router.get("/all", authMiddleware(["superadmin"]), AdminController.getAllAdmins);

export default router;
