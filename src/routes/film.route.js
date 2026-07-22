import { Router } from "express";
import { FilmController } from "../controllers/film.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { filmValidation } from "../validations/film.validation.js";
import { upload } from "../middlewares/upload.middleware.js";

const router = Router()

/**
 * @swagger
 * tags:
 *   name: Films
 *   description: Film management
 */

/**
 * @swagger
 * /api/film:
 *   get:
 *     summary: Get a list of films
 *     tags: [Films]
 *     responses:
 *       200:
 *         description: List of films
 */
router.get("/", FilmController.getFilmsList)

/**
 * @swagger
 * /api/film/code/{code}:
 *   get:
 *     summary: Search film by code
 *     tags: [Films]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Responds with film details
 */
router.get("/code/:code", FilmController.searchByCode)

/**
 * @swagger
 * /api/film/id/{id}:
 *   get:
 *     summary: Get film by database ID
 *     tags: [Films]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Responds with film details
 *       404:
 *         description: Film not found
 */
router.get("/id/:id", FilmController.getFilmById)

/**
 * @swagger
 * /api/film/search:
 *   post:
 *     summary: Search film using AI
 *     tags: [Films]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query:
 *                 type: string
 *                 example: "Yangi kinolar"
 *     responses:
 *       200:
 *         description: Matches found by AI
 */
router.post("/search", FilmController.searchByAi)

/**
 * @swagger
 * /api/film:
 *   post:
 *     summary: Create a film
 *     tags: [Films]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [code, name, originalName, year, country, description, episodesCount]
 *             properties:
 *               poster:
 *                 type: string
 *                 format: binary
 *               code:
 *                 type: integer
 *                 example: 50001
 *               name:
 *                 type: string
 *                 example: "Django"
 *               originalName:
 *                 type: string
 *                 example: "Django"
 *               year:
 *                 type: integer
 *                 example: 2024
 *               country:
 *                 type: string
 *                 example: "US"
 *               genres:
 *                 type: array
 *                 items:
 *                   type: string
 *               description:
 *                 type: string
 *                 example: "Film haqida batafsil ma'lumot"
 *               posterId:
 *                 type: object
 *                 properties:
 *                   channelId:
 *                     type: string
 *                     example: "3831468244"
 *                   msgId:
 *                     type: integer
 *                     example: 4
 *               episodesCount:
 *                 type: integer
 *                 example: 12
 *     responses:
 *       200:
 *         description: Film created
 */
router.post("/", upload.single('poster'), validate(filmValidation), FilmController.createFilm)

/**
 * @swagger
 * /api/film/{id}:
 *   delete:
 *     summary: Delete a film and all its episodes
 *     tags: [Films]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Film Database ID (_id) or Film Code
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Film and its episodes deleted successfully
 *       404:
 *         description: Film not found
 */
router.delete("/:id", FilmController.deleteFilm)

export default router