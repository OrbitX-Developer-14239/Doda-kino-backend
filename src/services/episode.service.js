import fs from 'fs/promises';
import { InputFile } from 'grammy';
import { CONFIG } from "../config/index.js";
import { EpisodeModel } from "../models/episode.model.js";
import { FilmModel } from "../models/film.model.js";
import { InstagramService } from "./instagram.service.js";
import { normalizeMediaId } from "../utils/media.utils.js";
import { getBotApi } from "../utils/telegram.js";
import { duplicateKeyError } from "../utils/errors.js";

export const EpisodeService = {
    async createEpisode(body, videoLocalPath, caption) {
        const { code, filmId } = body;

        const film = await FilmModel.findById(filmId)
            .select("_id description year country genres")
            .lean();
        if (!film) {
            if (videoLocalPath) await fs.unlink(videoLocalPath).catch(() => { });
            const error = new Error("Bunday film bazada mavjud emas");
            error.status = 404;
            throw error;
        }

        const excistEpisode = await EpisodeModel.findOne({ code }).select("_id").lean();
        if (excistEpisode) {
            if (videoLocalPath) await fs.unlink(videoLocalPath).catch(() => { });
            const error = new Error("Bunday code mavjud, mavjud bo'lmagan code kiriting!");
            error.status = 409;
            throw error;
        }

        let telegramVideoMediaId = body.videoFileId ? normalizeMediaId(body.videoFileId) : null;

        if (videoLocalPath) {
            try {
                const botApi = await getBotApi();
                const targetChannelId = CONFIG.CHANNEL_ID;
                if (!targetChannelId) {
                    throw new Error("CHANNEL_ID environment o'zgaruvchisi topilmadi!");
                }
                const file = new InputFile(videoLocalPath);
                const message = await botApi.sendVideo(targetChannelId, file);
                const cleanChannelId = String(message.chat.id).replace("-100", "");
                telegramVideoMediaId = {
                    channelId: cleanChannelId,
                    msgId: message.message_id
                };
            } catch (tgErr) {
                await fs.unlink(videoLocalPath).catch(() => { });
                if (tgErr.status === 404) throw tgErr;
                const error = new Error(`Telegramga epizod videosini yuklashda xato: ${tgErr.message}`);
                error.status = 400;
                throw error;
            }
        }

        const episodeData = {
            ...body,
            videoFileId: telegramVideoMediaId || normalizeMediaId(body.videoFileId),
            description: body.description || film.description,
            releaseYear: body.releaseYear || film.year,
            country: body.country || film.country,
            genres: (body.genres && body.genres.length > 0) ? body.genres : film.genres
        };

        let episode;
        try {
            episode = await EpisodeModel.create(episodeData);
        } catch (err) {
            if (videoLocalPath) await fs.unlink(videoLocalPath).catch(() => { });
            throw duplicateKeyError(err, "Bunday code mavjud, mavjud bo'lmagan code kiriting!");
        }

        // Atomik qo'shish: filmni o'qib-o'zgartirib-saqlash o'rniga $push + $sort.
        // Ilgari `film` obyekti funksiya boshida yuklanardi va uzoq yuklashlardan keyin
        // saqlanardi — parallel so'rovlarda epizodlar yo'qolar yoki VersionError chiqardi.
        await FilmModel.updateOne(
            { _id: film._id },
            {
                $push: {
                    episodes: {
                        $each: [{
                            episodeId: episode._id,
                            episodeNumber: episode.episodeNumber,
                            code: episode.code,
                            name: episode.name,
                            description: episode.description,
                            releaseYear: episode.releaseYear,
                            country: episode.country,
                            genres: episode.genres,
                            videoFileId: episode.videoFileId
                        }],
                        $sort: { episodeNumber: 1 }
                    }
                },
                $inc: { episodesCount: 1 }
            }
        );

        // Instagram nashri fon vazifasi sifatida bajariladi — ilgari u HTTP so'rovini
        // 50-90 sekund ushlab turardi va proxy timeout beradi.
        if (videoLocalPath) {
            this._publishToInstagram(episode._id, videoLocalPath, caption).catch(() => { });
        }

        return episode;
    },

    async _publishToInstagram(episodeId, videoLocalPath, caption) {
        try {
            const formattedPath = videoLocalPath.replace(/\\/g, '/');
            const publicVideoUrl = `${CONFIG.SERVER_URL || 'https://dodakino.orbitx.uz'}/${formattedPath}`;
            console.log(`🎬 Epizod uchun Reels yuklash boshlandi: ${publicVideoUrl}`);

            const instagramService = new InstagramService();
            const instagramPostId = await instagramService.uploadReels(publicVideoUrl, caption);

            await EpisodeModel.updateOne(
                { _id: episodeId },
                {
                    $set: {
                        instagramPostId,
                        instagramUrl: `https://www.instagram.com/p/${instagramPostId}`
                    }
                }
            );

            console.log(`✅ Reels yuklandi. Post ID: ${instagramPostId}.`);
        } catch (instagramError) {
            console.warn(`⚠️ Instagram Reels yuklashda xatolik (epizod saqlangan): ${instagramError.message}`);
        } finally {
            await fs.unlink(videoLocalPath)
                .catch((err) => console.error("⚠️ Vaqtinchalik faylni o'chirishda xato:", err.message));
        }
    },

    async updateEpisode(id, body) {
        const episode = await EpisodeModel.findById(id).lean();
        if (!episode) {
            const error = new Error("Epizod topilmadi");
            error.status = 404;
            throw error;
        }

        // Check if code is being updated and conflicts
        if (body.code && Number(body.code) !== episode.code) {
            const exists = await EpisodeModel.findOne({ code: Number(body.code) }).select("_id").lean();
            if (exists) {
                const error = new Error("Bunday code mavjud, boshqa code kiriting!");
                error.status = 409;
                throw error;
            }
        }

        const updatedData = {
            name: body.name || episode.name,
            description: body.description || episode.description,
            episodeNumber: body.episodeNumber ? Number(body.episodeNumber) : episode.episodeNumber,
            releaseYear: body.releaseYear ? Number(body.releaseYear) : episode.releaseYear,
            country: body.country || episode.country,
            genres: body.genres && body.genres.length > 0 ? body.genres : episode.genres,
            code: body.code ? Number(body.code) : episode.code,
        };

        let updatedEpisode;
        try {
            updatedEpisode = await EpisodeModel.findByIdAndUpdate(id, updatedData, { returnDocument: "after" });
        } catch (err) {
            throw duplicateKeyError(err, "Bunday code mavjud, boshqa code kiriting!");
        }

        // Update the episode inside the Film's episodes array
        await FilmModel.updateOne(
            { _id: updatedEpisode.filmId, "episodes.episodeId": updatedEpisode._id },
            {
                $set: {
                    "episodes.$.name": updatedEpisode.name,
                    "episodes.$.description": updatedEpisode.description,
                    "episodes.$.episodeNumber": updatedEpisode.episodeNumber,
                    "episodes.$.releaseYear": updatedEpisode.releaseYear,
                    "episodes.$.country": updatedEpisode.country,
                    "episodes.$.genres": updatedEpisode.genres,
                    "episodes.$.code": updatedEpisode.code,
                }
            }
        );

        return updatedEpisode;
    },

    /**
     * Epizodni o'chiradi. `identifier` sifatida ObjectId ham, epizod `code` i ham
     * qabul qilinadi — FilmService.deleteFilm bilan bir xil xatti-harakat.
     */
    async deleteEpisode(identifier) {
        const value = String(identifier ?? "").trim();
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(value);

        const query = isObjectId
            ? { _id: value }
            : (/^\d+$/.test(value) ? { code: Number(value) } : null);

        if (!query) {
            const error = new Error("Epizod ID yoki kodi noto'g'ri formatda");
            error.status = 400;
            throw error;
        }

        const episode = await EpisodeModel.findOne(query).select("_id filmId code").lean();
        if (!episode) {
            const error = new Error("Epizod topilmadi");
            error.status = 404;
            throw error;
        }

        await FilmModel.updateOne(
            { _id: episode.filmId, "episodes.episodeId": episode._id },
            {
                $pull: { episodes: { episodeId: episode._id } },
                $inc: { episodesCount: -1 }
            }
        );

        await EpisodeModel.deleteOne({ _id: episode._id });

        return {
            message: "Epizod muvaffaqiyatli o'chirildi",
            id: episode._id.toString(),
            code: episode.code
        };
    },

    async searchByCode(code) {
        return await EpisodeModel.findOne({ code }).lean();
    }
};