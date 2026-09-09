import { FilmModel } from "../models/film.model.js";
import { EpisodeModel } from "../models/episode.model.js";
import { mergedStores, mergedIncViews, mergedFilmsWithEpisodes } from "../core/content-merge.js";

/** Bazadan kelgan filmni panel kutgan ko'rinishga o'giradi */
const formatFilm = (f) => ({
    _id: f._id,
    name: f.name,
    code: f.code,
    views: f.views,
    episodes: (f.episodes || []).map((e) => ({
        _id: e.episodeId ? e.episodeId._id : null,
        name: e.name,
        code: e.code,
        views: e.episodeId ? e.episodeId.views : 0,
    })),
});

export const StatisticsService = {
    async addView(type, code) {
        if (type !== "film" && type !== "episode") {
            const error = new Error("Noto'g'ri type!");
            error.status = 400;
            throw error;
        }

        // Aralash bot: kod qaysi manba bazasida bo'lsa, o'sha yerda oshadi
        const stores = mergedStores();
        if (stores) {
            await mergedIncViews(stores, type, code);
            return true;
        }

        if (type === "film") {
            await FilmModel.updateOne({ code: Number(code) }, { $inc: { views: 1 } });
        } else {
            await EpisodeModel.updateOne({ code: Number(code) }, { $inc: { views: 1 } });
        }
        return true;
    },

    async getAll(page = 1, limit = 20) {
        const skip = (page - 1) * limit;

        const stores = mergedStores();
        if (stores) {
            const { films, totalFilms } = await mergedFilmsWithEpisodes(stores, {
                sort: { createdAt: -1 },
                page,
                limit,
            });
            return {
                data: films.slice(skip, skip + limit).map(formatFilm),
                pagination: {
                    page,
                    limit,
                    totalItems: totalFilms,
                    totalPages: Math.ceil(totalFilms / limit),
                },
            };
        }

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

        return {
            data: films.map(formatFilm),
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

        const stores = mergedStores();
        if (stores) {
            const { films } = await mergedFilmsWithEpisodes(stores, {
                sort: { views: -1 },
                page,
                limit,
            });
            return {
                data: films.slice(skip, skip + currentLimit).map(formatFilm),
                pagination: {
                    page,
                    limit: currentLimit,
                    totalPages: Math.ceil(topCount / limit),
                },
            };
        }

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

        return {
            data: topFilms.map(formatFilm),
            pagination: {
                page,
                limit: currentLimit,
                totalPages: Math.ceil(topCount / limit)
            }
        };
    }
};
