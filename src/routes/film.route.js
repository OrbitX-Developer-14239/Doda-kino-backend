import { Router } from "express";
import { FilmController } from "../controllers/film.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { filmValidation } from "../validations/film.validation.js";
import { upload } from "../middlewares/upload.middleware.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { botOrAdmin } from "../middlewares/access.middleware.js";
import { searchLimiter, uploadLimiter } from "../middlewares/rateLimit.middleware.js";

const router = Router()

// Tahrirlashda rasm ixtiyoriy: cheklov faqat fayl yuborilgan (multipart) so'rovga
// qo'llanadi, oddiy matn tahriri (JSON) ilgarigidek cheklovsiz qoladi.
const uploadLimiterIfFile = (req, res, next) =>
    req.is("multipart/form-data") ? uploadLimiter(req, res, next) : next();

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
router.get("/", botOrAdmin(["superadmin", "admin"]), FilmController.getFilmsList)

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
router.get("/code/:code", botOrAdmin(["superadmin", "admin"]), FilmController.searchByCode)

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
router.get("/id/:id", botOrAdmin(["superadmin", "admin"]), FilmController.getFilmById)

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
router.post("/search", searchLimiter, botOrAdmin(["superadmin", "admin"]), FilmController.searchByAi)

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
 *             required: [code, name, originalName, year, country, description]
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
 *     responses:
 *       200:
 *         description: Film created
 */
router.post("/", authMiddleware(["superadmin", "admin"]), uploadLimiter, upload.single('poster'), validate(filmValidation), FilmController.createFilm)

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
router.delete("/:id", authMiddleware(["superadmin", "admin"]), FilmController.deleteFilm)

/**
 * @swagger
 * /api/film/{id}:
 *   put:
 *     summary: Update a film (text data and/or poster image)
 *     description: >
 *       Yangi rasm yuklash uchun multipart/form-data da `poster` fayli yuboriladi.
 *       Rasm yuborilmasa eski poster o'zgarishsiz qoladi.
 *     tags: [Films]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Film Database ID (_id)
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               poster:
 *                 type: string
 *                 format: binary
 *                 description: Yangi poster rasmi (.jpg, .png, .webp, .gif)
 *               code:
 *                 type: integer
 *               name:
 *                 type: string
 *               originalName:
 *                 type: string
 *               year:
 *                 type: integer
 *               country:
 *                 type: string
 *               genres:
 *                 type: array
 *                 items:
 *                   type: string
 *               description:
 *                 type: string
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: integer
 *               name:
 *                 type: string
 *               originalName:
 *                 type: string
 *               year:
 *                 type: integer
 *               country:
 *                 type: string
 *               genres:
 *                 type: array
 *                 items:
 *                   type: string
 *               description:
 *                 type: string
 *               posterId:
 *                 type: object
 *                 description: Telegramga allaqachon yuklangan rasmni bog'lash uchun
 *                 properties:
 *                   channelId:
 *                     type: string
 *                     example: "3831468244"
 *                   msgId:
 *                     type: integer
 *                     example: 4
 *     responses:
 *       200:
 *         description: Film updated successfully
 *       404:
 *         description: Film not found
 */
router.put("/:id", authMiddleware(["superadmin", "admin"]), uploadLimiterIfFile, upload.single('poster'), FilmController.updateFilm)

export default router