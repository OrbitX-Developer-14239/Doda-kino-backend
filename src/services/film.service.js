import fs from 'fs/promises';
import { InputFile } from "grammy";
import { CONFIG } from "../config/index.js";
import { FilmModel } from "../models/film.model.js";
import { EpisodeModel } from "../models/episode.model.js";
import { normalizeMediaId } from "../utils/media.utils.js";
import { getBotApi } from "../utils/telegram.js";
import { duplicateKeyError } from "../utils/errors.js";

export const FilmService = {
    async createFilm(body, posterLocalPath) {
        // Vaqtinchalik fayl qaysi yo'l bilan chiqmaylik o'chiriladi (orfan fayl qolmasin).
        try {
            const { code } = body;

            const excistFilm = await FilmModel.findOne({ code }).select("_id").lean();
            if (excistFilm) {
                const error = new Error("Bunday code mavjud, mavjud bo'lmagan code kiriting!");
                error.status = 409;
                throw error;
            }

            let finalPoster = body.posterId ? normalizeMediaId(body.posterId) : null;

            if (posterLocalPath) {
                try {
                    const botApi = await getBotApi();
                    const targetChannelId = CONFIG.CHANNEL_ID;
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
                    if (tgError.status === 404) throw tgError;
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

            let data;
            try {
                data = await FilmModel.create({ ...body, posterId: finalPoster });
            } catch (err) {
                throw duplicateKeyError(err, "Bunday code mavjud, mavjud bo'lmagan code kiriting!");
            }

            import('./ai.service.js').then(({ AIService }) => {
                AIService.addFilmToIndex(data).catch(() => { });
            });

            return data;
        } finally {
            if (posterLocalPath) {
                await fs.unlink(posterLocalPath)
                    .catch((err) => console.error("⚠️ Posterni o'chirishda xato:", err.message));
            }
        }
    },

    async updateFilm(id, body) {
        const film = await FilmModel.findById(id).lean();
        if (!film) {
            const error = new Error("Film topilmadi");
            error.status = 404;
            throw error;
        }

        // If code is being changed, check if it's already used
        if (body.code && Number(body.code) !== film.code) {
            const exists = await FilmModel.findOne({ code: Number(body.code) }).select("_id").lean();
            if (exists) {
                const error = new Error("Bunday code mavjud, boshqa code kiriting!");
                error.status = 409;
                throw error;
            }
        }

        const updatedData = {
            name: body.name || film.name,
            originalName: body.originalName || film.originalName,
            description: body.description || film.description,
            year: body.year || film.year,
            country: body.country || film.country,
            genres: body.genres && body.genres.length > 0 ? body.genres : film.genres,
            code: body.code ? Number(body.code) : film.code,
            episodesCount: body.episodesCount || film.episodesCount
        };

        let updatedFilm;
        try {
            updatedFilm = await FilmModel.findByIdAndUpdate(id, updatedData, { new: true });
        } catch (err) {
            throw duplicateKeyError(err, "Bunday code mavjud, boshqa code kiriting!");
        }

        // Update AI index if needed
        import('./ai.service.js').then(({ AIService }) => {
            AIService.addFilmToIndex(updatedFilm).catch(() => { });
        });

        return updatedFilm;
    },

    async getFilmById(id) {
        return await FilmModel.findById(id).lean();
    },

    async getAllFilmsPaginated(page = 1) {
        const limit = CONFIG.ITEMS_PER_PAGE || 12;
        const safePage = Math.max(1, Number(page) || 1);
        const skip = (safePage - 1) * limit;

        const [totalFilms, films] = await Promise.all([
            FilmModel.estimatedDocumentCount(),
            FilmModel.find()
                .select("name originalName year code views posterId")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
        ]);

        const totalPages = Math.ceil(totalFilms / limit);

        return {
            films,
            pagination: {
                currentPage: safePage,
                totalPages,
                totalFilms
            }
        };
    },

    async searchByCode(code) {
        return await FilmModel.findOne({ code }).lean();
    },

    async searchByName(name, limit = 20) {
        return await this.searchByNames([name], limit);
    },

    /**
     * Bir nechta qidiruv so'zini BITTA so'rovda qidiradi.
     * Ilgari AI xizmati har bir so'z uchun alohida so'rov yuborardi (20+ ta to'liq skanerlash).
     */
    async searchByNames(names, limit = 60) {
        const patterns = (Array.isArray(names) ? names : [names])
            .map((n) => String(n || "").trim())
            .filter((n) => n.length >= 2)
            .slice(0, 30)
            .map((n) => new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));

        if (!patterns.length) return [];

        return await FilmModel.find({
            $or: [
                { name: { $in: patterns } },
                { originalName: { $in: patterns } }
            ]
        })
            .select("name originalName code year")
            .limit(limit)
            .lean();
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