import { CONFIG } from "../config/index.js";
import { FilmModel } from "../models/film.model.js";

export const FilmService = {
    async createFilm(body) {
        const { code } = body;
        const excistFilm = await FilmModel.findOne({ code });
        if (excistFilm) {
            const error = new Error("Bunday code mavjud, mavjud bo'lmagan code kiriting!");
            error.status = 409;
            throw error;
        }

        const data = await FilmModel.create(body)

        import('./ai.service.js').then(({ AIService }) => {

            AIService.addFilmToIndex(data).catch(() => { });
        });

        return data
    },

    async getAllFilmsPaginated(page = 1) {
        const limit = CONFIG.ITEMS_PER_PAGE || 12;
        const skip = (page - 1) * limit;

        const totalFilms = await FilmModel.countDocuments();
        const totalPages = Math.ceil(totalFilms / limit);

        const films = await FilmModel.find()
            .select("name year code")
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        return {
            films,
            pagination: {
                currentPage: page,
                totalPages,
                totalFilms
            }
        };
    },

    async searchByCode(code) {
        return await FilmModel.findOne({ code });
    },

    async searchByName(name) {
        const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(safeName, "i");
        return await FilmModel.find({ name: regex }).select("name id code year");
    }
};