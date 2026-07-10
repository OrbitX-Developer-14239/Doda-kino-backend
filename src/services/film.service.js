import fs from 'fs/promises';
import { Api, InputFile } from "grammy";
import { CONFIG } from "../config/index.js";
import { BotModel } from "../models/bot.model.js";
import { FilmModel } from "../models/film.model.js";

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

        if (!posterLocalPath) {
            const error = new Error("Film poster rasmi majburiy!");
            error.status = 400;
            throw error;
        }

        const botTokenObj = await BotModel.findOne();
        if (!botTokenObj || !botTokenObj.token) {
            if (posterLocalPath) await fs.unlink(posterLocalPath).catch(() => { });
            const error = new Error("Bot token topilmadi!");
            error.status = 404;
            throw error;
        }

        let posterTelegramId = "";

        try {
            const botApi = new Api(botTokenObj.token);

            const targetChannelId = "-1004389929267";

            const file = new InputFile(posterLocalPath);
            const message = await botApi.sendPhoto(targetChannelId, file);

            posterTelegramId = String(message.message_id);

        } catch (tgError) {
            if (posterLocalPath) await fs.unlink(posterLocalPath).catch(() => { });
            const error = new Error(`Telegramga yuklashda xato: ${tgError.message}`);
            error.status = 400;
            throw error;
        }

        const data = await FilmModel.create({ ...body, posterId: posterTelegramId });

        if (posterLocalPath) {
            await fs.unlink(posterLocalPath).catch((err) => console.error("⚠️ Posterni o'chirishda xato:", err.message));
        }

        import('./ai.service.js').then(({ AIService }) => {
            AIService.addFilmToIndex(data).catch(() => { });
        });

        return data;
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