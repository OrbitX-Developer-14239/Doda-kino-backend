import fs from 'fs/promises';
import { Api, InputFile } from 'grammy';
import { CONFIG } from "../config/index.js";
import { EpisodeModel } from "../models/episode.model.js";
import { FilmModel } from "../models/film.model.js";
import { BotModel } from "../models/bot.model.js";
import { InstagramService } from "./instagram.service.js";
import { normalizeMediaId } from "../utils/media.utils.js";

export const EpisodeService = {
    async createEpisode(body, videoLocalPath, caption) {
        const { code, filmId } = body;

        const film = await FilmModel.findById(filmId);
        if (!film) {
            if (videoLocalPath) await fs.unlink(videoLocalPath).catch(() => { });
            const error = new Error("Bunday film bazada mavjud emas");
            error.status = 404;
            throw error;
        }

        const excistEpisode = await EpisodeModel.findOne({ code });
        if (excistEpisode) {
            if (videoLocalPath) await fs.unlink(videoLocalPath).catch(() => { });
            const error = new Error("Bunday code mavjud, mavjud bo'lmagan code kiriting!");
            error.status = 409;
            throw error;
        }

        let instagramPostId;
        let instagramUrl;
        let telegramVideoMediaId = body.videoFileId ? normalizeMediaId(body.videoFileId) : null;

        if (videoLocalPath) {
            const botTokenObj = await BotModel.findOne();
            if (!botTokenObj || !botTokenObj.token) {
                await fs.unlink(videoLocalPath).catch(() => { });
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
                const file = new InputFile(videoLocalPath);
                const message = await botApi.sendVideo(targetChannelId, file);
                const cleanChannelId = String(message.chat.id).replace("-100", "");
                telegramVideoMediaId = {
                    channelId: cleanChannelId,
                    msgId: message.message_id
                };
            } catch (tgErr) {
                await fs.unlink(videoLocalPath).catch(() => { });
                const error = new Error(`Telegramga epizod videosini yuklashda xato: ${tgErr.message}`);
                error.status = 400;
                throw error;
            }

            try {
                const formattedPath = videoLocalPath.replace(/\\/g, '/');
                const publicVideoUrl = `${CONFIG.SERVER_URL || 'https://dodakino.orbitx.uz'}/${formattedPath}`;
                console.log(`🎬 Epizod uchun Reels yuklash boshlandi: ${publicVideoUrl}`);

                const instagramService = new InstagramService();
                instagramPostId = await instagramService.uploadReels(publicVideoUrl, caption);
                instagramUrl = `https://www.instagram.com/p/${instagramPostId}`;

                console.log(`✅ Reels yuklandi. Post ID: ${instagramPostId}.`);
            } catch (instagramError) {
                console.warn(`⚠️ Instagram Reels yuklashda xatolik yuz berdi (epizod yaratish davom etmoqda): ${instagramError.message}`);
            }
        }

        const episodeData = {
            ...body,
            videoFileId: telegramVideoMediaId || normalizeMediaId(body.videoFileId),
            instagramPostId,
            instagramUrl,
            description: body.description || film.description,
            releaseYear: body.releaseYear || film.year,
            country: body.country || film.country,
            genres: (body.genres && body.genres.length > 0) ? body.genres : film.genres
        };

        const episode = await EpisodeModel.create(episodeData);

        film.episodes.push({
            episodeId: episode._id,
            episodeNumber: episode.episodeNumber,
            code: episode.code,
            name: episode.name,
            description: episode.description,
            releaseYear: episode.releaseYear,
            country: episode.country,
            genres: episode.genres,
            videoFileId: episode.videoFileId
        });

        film.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        film.episodesCount = film.episodes.length;

        await film.save();

        if (videoLocalPath) {
            await fs.unlink(videoLocalPath).catch((err) => console.error("⚠️ Vaqtinchalik faylni o'chirishda xato:", err.message));
        }

        return episode;
    },

    async searchByCode(code) {
        return await EpisodeModel.findOne({ code });
    }
};