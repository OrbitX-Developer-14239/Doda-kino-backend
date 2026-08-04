import { FilmModel } from "../models/film.model.js";
import { EpisodeModel } from "../models/episode.model.js";

export const StatisticsService = {
    async addView(type, code) {
        if (type === "film") {
            await FilmModel.updateOne({ code: Number(code) }, { $inc: { views: 1 } });
        } else if (type === "episode") {
            await EpisodeModel.updateOne({ code: Number(code) }, { $inc: { views: 1 } });
        } else {
            const error = new Error("Noto'g'ri type!");
            error.status = 400;
            throw error;
        }
        return true;
    },

    async getAll(page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const totalFilms = await FilmModel.estimatedDocumentCount();

        const films = await FilmModel.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select("name code views episodes")
            .populate({
                path: "episodes.episodeId",
                select: "name code views"
            })
            .lean();

        const formattedFilms = films.map(f => ({
            _id: f._id,
            name: f.name,
            code: f.code,
            views: f.views,
            episodes: f.episodes.map(e => ({
                _id: e.episodeId ? e.episodeId._id : null,
                name: e.name,
                code: e.code,
                views: e.episodeId ? e.episodeId.views : 0
            }))
        }));

        return {
            data: formattedFilms,
            pagination: {
                page,
                limit,
                totalItems: totalFilms,
                totalPages: Math.ceil(totalFilms / limit)
            }
        };
    },

    async getTop(topCount = 100, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        
        if (skip >= topCount) {
            return {
                data: [],
                pagination: { page, limit, totalPages: Math.ceil(topCount / limit) }
            };
        }

        const currentLimit = Math.min(limit, topCount - skip);

        const topFilms = await FilmModel.find()
            .sort({ views: -1 })
            .skip(skip)
            .limit(currentLimit)
            .select("name code views episodes")
            .populate({
                path: "episodes.episodeId",
                select: "name code views"
            })
            .lean();

        const formattedTopFilms = topFilms.map(f => ({
            _id: f._id,
            name: f.name,
            code: f.code,
            views: f.views,
            episodes: f.episodes.map(e => ({
                _id: e.episodeId ? e.episodeId._id : null,
                name: e.name,
                code: e.code,
                views: e.episodeId ? e.episodeId.views : 0
            }))
        }));

        return {
            data: formattedTopFilms,
            pagination: {
                page,
                limit: currentLimit,
                totalPages: Math.ceil(topCount / limit)
            }
        };
    }
};
