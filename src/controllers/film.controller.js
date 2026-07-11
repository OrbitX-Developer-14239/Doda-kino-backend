import { AIService } from "../services/ai.service.js";
import { FilmService } from "../services/film.service.js";
import { catchAsync } from "../utils/catchAsync.js";

export const FilmController = {
    createFilm: catchAsync(async (req, res) => {
        const body = req.body

        const posterLocalPath = req.file?.path;
        const data = await FilmService.createFilm(body, posterLocalPath)

        res.status(201).json({ success: true, data })
    }),

    getFilmsList: catchAsync(async (req, res) => {
        const page = parseInt(req.query.page) || 1
        const result = await FilmService.getAllFilmsPaginated(page)

        res.status(200).json({ success: true, ...result })
    }),

    searchByCode: catchAsync(async (req, res) => {
        const data = await FilmService.searchByCode(req.params.code)

        res.status(200).json({ success: true, data })
    }),

    searchByAi: catchAsync(async (req, res) => {
        const { query } = req.body
        const result = await AIService.askAI(query)

        res.status(200).json({ success: true, data: result })
    }),
}