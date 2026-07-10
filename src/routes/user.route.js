import { Router } from "express";
import { userController } from "../controllers/user.controller.js";

const router = Router()

router.post("/", userController.createUser)
router.put("/", userController.updateUser)
router.get("/", userController.getUsers)

export default router