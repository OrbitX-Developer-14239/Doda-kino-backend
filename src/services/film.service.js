import fs from 'fs/promises';
import { Api, InputFile } from "grammy";
import { CONFIG } from "../config/index.js";
import { BotModel } from "../models/bot.model.js";
import { FilmModel } from "../models/film.model.js";
import { EpisodeModel } from "../models/episode.model.js";
import { normalizeMediaId } from "../utils/media.utils.js";

export const FilmService = {
    async createFilm(body, posterLocalPath) {
        const { code } = body;

        const excistFilm = await FilmModel.findOne({ code });
        if (excistFilm) {
            if (posterLocalPath) await fs.unlink(posterLocalPath).catch(() => { });
            const error = new Error("Bunday code mavjud, mavjud bo'lmagan code kiriting!");
            error.status = 409;
            throw error;
        }

        let finalPoster = body.posterId ? normalizeMediaId(body.posterId) : null;

        if (posterLocalPath) {
            const botTokenObj = await BotModel.findOne();
            if (!botTokenObj || !botTokenObj.token) {
                await fs.unlink(posterLocalPath).catch(() => { });
                const error = new Error("Bot token topilmadi!");
                error.status = 404;
                throw error;
            }

            try {
                const botApi = new Api(botTokenObj.token);
                const targetChannelId = CONFIG.CHANNEL_ID || process.env.CHANNEL_ID;
                if (!targetChannelId) {
                    throw new Error("CHANNEL_ID environment o'zgaruvchisi topilmadi!");
                }

                const file = new InputFile(posterLocalPath);
                const message = await botApi.sendPhoto(targetChannelId, file);

                const cleanChannelId = String(message.chat.id).replace("-100", "");
                finalPoster = {
                    channelId: cleanChannelId,
                    msgId: message.message_id
                };
            } catch (tgError) {
                await fs.unlink(posterLocalPath).catch(() => { });
                const error = new Error(`Telegramga yuklashda xato: ${tgError.message}`);
                error.status = 400;
                throw error;
            }
        }

        if (!finalPoster) {
            const error = new Error("Film poster rasmi majburiy!");
            error.status = 400;
            throw error;
        }

        const data = await FilmModel.create({ ...body, posterId: finalPoster });

        if (posterLocalPath) {
            await fs.unlink(posterLocalPath).catch((err) => console.error("⚠️ Posterni o'chirishda xato:", err.message));
        }

        import('./ai.service.js').then(({ AIService }) => {
            AIService.addFilmToIndex(data).catch(() => { });
        });

        return data;
    },

    async getFilmById(id) {
        return await FilmModel.findById(id);
    },

    async getAllFilmsPaginated(page = 1) {
        const limit = CONFIG.ITEMS_PER_PAGE || 12;
        const skip = (page - 1) * limit;

        const totalFilms = await FilmModel.countDocuments();
        const totalPages = Math.ceil(totalFilms / limit);

        const films = await FilmModel.find()
            .select("name originalName year code")
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
        return await FilmModel.find({
            $or: [{ name: regex }, { originalName: regex }]
        }).select("name originalName id code year");
    },

    async deleteFilm(id) {
        let film;
        if (/^[0-9a-fA-F]{24}$/.test(id)) {
            film = await FilmModel.findById(id);
        } else if (!isNaN(id)) {
            film = await FilmModel.findOne({ code: Number(id) });
        } else {
            film = await FilmModel.findById(id).catch(() => null);
        }

        if (!film) {
            const error = new Error("Film topilmadi!");
            error.status = 404;
            throw error;
        }

        // Delete all episodes associated with this film
        const deletedEpisodes = await EpisodeModel.deleteMany({ filmId: film._id });

        // Delete the film document
        await FilmModel.findByIdAndDelete(film._id);

        return {
            message: "Film va unga tegishli barcha epizodlar muvaffaqiyatli o'chirildi",
            deletedFilmId: film._id,
            deletedFilmCode: film.code,
            deletedEpisodesCount: deletedEpisodes.deletedCount
        };
    }
};