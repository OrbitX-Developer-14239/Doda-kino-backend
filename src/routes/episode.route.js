import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { EpisodeValidation } from "../validations/episode.validation.js";
import { EpisodeController } from "../controllers/episode.controller.js";
import { upload } from '../middlewares/upload.middleware.js';

const router = Router()


router.post("/", upload.single('instagramVideo'), validate(EpisodeValidation), EpisodeController.createEpisode)
router.get("/code/:code", EpisodeController.searchByCode)

export default router