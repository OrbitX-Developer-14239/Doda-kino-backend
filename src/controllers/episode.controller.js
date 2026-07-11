import { EpisodeService } from "../services/episode.service.js";
import { catchAsync } from "../utils/catchAsync.js";

export const EpisodeController = {
    createEpisode: catchAsync(async (req, res, next) => {
        const body = req.body;

        const videoLocalPath = req.file?.path;
        const caption = body.caption || `${body.caption || 'Yangi qism'} #film #dodakino`;

        const data = await EpisodeService.createEpisode(body, videoLocalPath, caption);

        res.status(201).json({ success: true, data });
    }),

    searchByCode: catchAsync(async (req, res) => {
        const episodeCode = Number(req.params.code);

        if (isNaN(episodeCode)) {
            const error = new Error("Kino kodi faqat raqamlardan iborat bo'lishi kerak!");
            error.status = 400;
            throw error;
        }

        const data = await EpisodeService.searchByCode(episodeCode);

        res.status(200).json({ success: true, data });
    }),
}