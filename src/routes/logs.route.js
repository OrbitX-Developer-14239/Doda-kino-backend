import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { LogController } from "../controllers/log.controller.js";
// import { logger } from "../utils/logger.js";

const router = Router();

// router.get("/test", (req, res) => {
//     logger.info("Test log ishlayapti! Ushbu xabar socket orqali yetib borishi kerak.");
//     logger.error("Test xato logi hammayoq yonib ketyapti! 🔥");
//     res.json({ message: "Test loglar yuborildi!" });
// });

router.get("/", authMiddleware(["superadmin", "admin"]), LogController.getAllLogs);
export default router;