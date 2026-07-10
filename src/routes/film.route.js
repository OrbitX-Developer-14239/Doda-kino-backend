import { Router } from "express";
import { FilmController } from "../controllers/film.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { filmValidation } from "../validations/film.validation.js";
import { upload } from "../middlewares/upload.middleware.js";

const router = Router()

router.get("/", FilmController.getFilmsList)
router.get("/code/:code", FilmController.searchByCode)
router.post("/search", FilmController.searchByAi)
router.post("/", upload.single('poster'), validate(filmValidation), FilmController.createFilm)

export default router