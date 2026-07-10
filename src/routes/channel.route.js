import { Router } from "express";
import { ChannelController } from "../controllers/channel.controller.js";

const router = Router()

router.post("/", ChannelController.createChannel)
router.get("/", ChannelController.getChannels)
router.delete("/:id", ChannelController.deleteChannel)

export default router