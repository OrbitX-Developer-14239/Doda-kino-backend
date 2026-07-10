import { Router } from "express";
import { AdminController } from "../controllers/admin.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { adminUpdateValidation, adminValidation } from "../validations/admin.validation.js";
import { validate } from "../middlewares/validate.middleware.js";
import { botAuthMiddleware } from "../middlewares/botAuth.middleware.js";

const router = Router();

router.post("/login", validate(adminValidation), AdminController.login);
router.post("/verify/:token", AdminController.verifyAdmin);
router.post("/verify-bot", botAuthMiddleware(), AdminController.verifyAdminByBot);
router.post("/telegram-login", botAuthMiddleware(), AdminController.requestTelegramLogin);
router.post("/telegram-login-link", botAuthMiddleware(), AdminController.requestTelegramLoginByContact);
router.post("/telegram-auth", AdminController.telegramAuth);
router.post("/create", authMiddleware(["superadmin"]), validate(adminValidation), AdminController.createAdmin);
router.put("/:id", authMiddleware(["superadmin", "admin"]), validate(adminUpdateValidation), AdminController.updateAdmin);
router.delete("/:id", authMiddleware(["superadmin"]), AdminController.deleteAdmin);
router.post("/refresh", AdminController.refresh);
router.post("/logout", authMiddleware(), AdminController.logout);

export default router;
