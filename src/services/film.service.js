import fs from 'fs/promises';
import { InputFile } from "grammy";
import { CONFIG } from "../config/index.js";
import { requireTenant } from "../core/tenant-context.js";
import { FilmModel } from "../models/film.model.js";
import { EpisodeModel } from "../models/episode.model.js";
import { normalizeMediaId } from "../utils/media.utils.js";
import { getBotApi } from "../utils/telegram.js";
import { duplicateKeyError } from "../utils/errors.js";
import { cache } from "./cache.service.js";
import { SearchIndex } from "./search-index.service.js";

/**
 * Posterni Telegram kanaliga yuklab, bazaga saqlanadigan { channelId, msgId } ni qaytaradi.
 * createFilm va updateFilm bir xil yo'ldan foydalanadi.
 */
async function uploadPosterToTelegram(posterLocalPath) {
    try {
        const botApi = await getBotApi();
        // Har botning O'Z poster kanali (.env dagi CHANNEL_ID1/2/3) —
        // bot o'sha kanalda admin bo'lishi shart.
        const targetChannelId = requireTenant("poster yuklash").channelId;
        if (!targetChannelId) {
            const error = new Error("Bu bot uchun poster kanali (.env da CHANNEL_IDn) sozlanmagan!");
            error.status = 400;
            throw error;
        }

        const file = new InputFile(posterLocalPath);
        const message = await botApi.sendPhoto(targetChannelId, file);

        return {
            channelId: String(message.chat.id).replace("-100", ""),
            msgId: message.message_id
        };
    } catch (tgError) {
        if (tgError.status === 404) throw tgError;
        const error = new Error(`Telegramga yuklashda xato: ${tgError.message}`);
        error.status = 400;
        throw error;
    }
}

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
                finalPoster = await uploadPosterToTelegram(posterLocalPath);
            }

            if (!finalPoster) {
                const error = new Error("Film poster rasmi majburiy!");
                error.status = 400;
                throw error;
            }

            let data;
            try {
                // episodesCount har doim 0 dan boshlanadi — yangi filmda hali epizod yo'q.
                // Tashqaridan kelgan qiymat e'tiborga olinmaydi, aks holda epizod
                // qo'shilganda ustiga qo'shilib ketardi.
                data = await FilmModel.create({ ...body, posterId: finalPoster, episodesCount: 0 });
            } catch (err) {
                throw duplicateKeyError(err, "Bunday code mavjud, mavjud bo'lmagan code kiriting!");
            }

            SearchIndex.upsert(data);

            // Yangi film qo'shildi — ro'yxat va qidiruv keshi eskirdi
            await cache.invalidateFilm(data.toObject?.() ?? data);

            return data;
        } finally {
            if (posterLocalPath) {
                await fs.unlink(posterLocalPath)
                    .catch((err) => console.error("⚠️ Posterni o'chirishda xato:", err.message));
            }
        }
    },

    async updateFilm(id, body, posterLocalPath) {
        // Vaqtinchalik fayl qaysi yo'l bilan chiqmaylik o'chiriladi (orfan fayl qolmasin).
        try {
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
                seasonsCount: body.seasonsCount ? Number(body.seasonsCount) : (film.seasonsCount || 1)
                // episodesCount ataylab tegilmaydi — u epizodlar bo'yicha avtomatik yuritiladi.
            };

            // Poster: yangi fayl yuborilsa Telegramga yuklanadi, aks holda tayyor
            // posterId qabul qilinadi. Ikkalasi ham bo'lmasa eski rasm o'zgarmaydi.
            const newPoster = posterLocalPath
                ? await uploadPosterToTelegram(posterLocalPath)
                : (body.posterId ? normalizeMediaId(body.posterId) : null);

            if (newPoster) {
                updatedData.posterId = newPoster;
            }

            let updatedFilm;
            try {
                updatedFilm = await FilmModel.findByIdAndUpdate(id, updatedData, { returnDocument: "after" });
            } catch (err) {
                throw duplicateKeyError(err, "Bunday code mavjud, boshqa code kiriting!");
            }

            // Qidiruv indeksini yangilaymiz (nom yoki kod o'zgargan bo'lishi mumkin)
            SearchIndex.upsert(updatedFilm);

            // Eski VA yangi holat bo'yicha bekor qilamiz: kod yoki nom
            // o'zgargan bo'lsa eski kalit ham qolib ketmasligi kerak.
            await cache.invalidateFilm(film, updatedFilm?.toObject?.() ?? updatedFilm);

            return updatedFilm;
        } finally {
            if (posterLocalPath) {
                await fs.unlink(posterLocalPath)
                    .catch((err) => console.error("⚠️ Posterni o'chirishda xato:", err.message));
            }
        }
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
                // episodesCount ham kerak: admin paneldagi "Qismlar" ustuni shundan
                // o'qiydi. U tanlanmagani uchun ro'yxatda hamma film "0 ta" ko'rinardi.
                .select("name originalName year code views posterId episodesCount seasonsCount")
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

        SearchIndex.remove(film.code);

        // Film ham, uning barcha qismlari ham keshdan chiqarilishi kerak —
        // aks holda bot o'chirilgan filmni TTL tugagunicha ko'rsatib turadi.
        await cache.invalidateFilm(film.toObject?.() ?? film);

        return {
            message: "Film va unga tegishli barcha epizodlar muvaffaqiyatli o'chirildi",
            deletedFilmId: film._id,
            deletedFilmCode: film.code,
            deletedEpisodesCount: deletedEpisodes.deletedCount
        };
    }
};