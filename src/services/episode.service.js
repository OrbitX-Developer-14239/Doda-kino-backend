import fs from 'fs/promises';
import { CONFIG } from "../config/index.js";
import { EpisodeModel } from "../models/episode.model.js";
import { FilmModel } from "../models/film.model.js";
import { InstagramService } from "./instagram.service.js";

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

        if (videoLocalPath) {
            try {
                const formattedPath = videoLocalPath.replace(/\\/g, '/');
                const publicVideoUrl = `${CONFIG.SERVER_URL || 'https://loyiha-nomi.onrender.com'}/${formattedPath}`;
                console.log(`🎬 1. Epizod uchun Reels yuklash boshlandi: ${publicVideoUrl}`);

                const instagramService = new InstagramService();
                instagramPostId = await instagramService.uploadReels(publicVideoUrl, caption);
                instagramUrl = `https://www.instagram.com/p/${instagramPostId}`;

                console.log(`✅ 2. Reels yuklandi. Post ID: ${instagramPostId}. Endi epizod bazaga yozilmoqda...`);
            } catch (instagramError) {
                await fs.unlink(videoLocalPath).catch(() => { });
                throw instagramError;
            }
        }

        const episodeData = {
            ...body,
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
            genres: episode.genres
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