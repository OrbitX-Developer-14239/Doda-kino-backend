import { Router } from "express";
import { BotController } from "../controllers/bot.controller.js";

const router = Router()

router.post("/save", BotController.saveToken)
router.get("/get", BotController.getToken)

export default router