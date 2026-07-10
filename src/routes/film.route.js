import { Router } from "express";
import { FilmController } from "../controllers/film.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { filmValidation } from "../validations/film.validation.js";

const router = Router()

router.get("/", FilmController.getFilmsList)
router.get("/code/:code", FilmController.searchByCode)
router.post("/search", FilmController.searchByAi)
router.post("/", validate(filmValidation), FilmController.createFilm)

export default router