import { FilmModel } from "../models/film.model.js";
import { EpisodeModel } from "../models/episode.model.js";
import { logger } from "../utils/logger.js";

export const StatisticsController = {
    async addView(req, res, next) {
        try {
            const { type, code } = req.body;

            if (!type || !code) {
                return res.status(400).json({ success: false, message: "Type va code majburiy!" });
            }

            if (type === "film") {
                await FilmModel.updateOne({ code: Number(code) }, { $inc: { views: 1 } });
            } else if (type === "episode") {
                await EpisodeModel.updateOne({ code: Number(code) }, { $inc: { views: 1 } });
            } else {
                return res.status(400).json({ success: false, message: "Noto'g'ri type!" });
            }

            return res.status(200).json({ success: true, message: "View qo'shildi" });
        } catch (error) {
            logger.error(`[StatisticsController.addView] Error: ${error.message}`);
            next(error);
        }
    },

    async getTop(req, res, next) {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const topFilms = await FilmModel.find().sort({ views: -1 }).limit(limit).select("name originalName code views");
            const topEpisodes = await EpisodeModel.find().sort({ views: -1 }).limit(limit).select("name code views filmId").populate("filmId", "name");

            return res.status(200).json({
                success: true,
                data: {
                    topFilms,
                    topEpisodes
                }
            });
        } catch (error) {
            logger.error(`[StatisticsController.getTop] Error: ${error.message}`);
            next(error);
        }
    }
};
