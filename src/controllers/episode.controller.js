import { EpisodeService } from "../services/episode.service.js";
import { AIMetadataService } from "../services/ai-metadata.service.js";
import { CodeService } from "../services/code.service.js";
import { FilmService } from "../services/film.service.js";
import { catchAsync } from "../utils/catchAsync.js";

export const EpisodeController = {
    /**
     * Qism uchun AI taklifi + bo'sh kod. Bazaga hech narsa yozmaydi.
     * `filmId` berilsa serial nomi/yili/davlati bazadan olinadi,
     * aks holda `filmName` majburiy.
     */
    aiSuggest: catchAsync(async (req, res) => {
        const { filmId, filmName, episodeNumber = 1, count = 1 } = req.body;

        let film = null;
        if (filmId) {
            film = await FilmService.getFilmById(filmId);
            if (!film) throw Object.assign(new Error("Film topilmadi"), { status: 404 });
        }

        const name = film?.originalName || film?.name || filmName;
        if (!name) {
            throw Object.assign(new Error("filmId yoki filmName berilishi shart"), { status: 400 });
        }

        const [episode, codes] = await Promise.all([
            AIMetadataService.suggestEpisode({
                filmName: name,
                episodeNumber,
                year: film?.year,
                country: film?.country,
            }),
            CodeService.nextEpisodeCodes(count),
        ]);

        res.status(200).json({
            success: true,
            data: {
                episode: { ...episode, episodeNumber, code: codes[0] },
                codes,
            },
        });
    }),

    createEpisode: catchAsync(async (req, res, next) => {
        const body = req.body;

        const videoLocalPath = req.file?.path;
        const caption = `${body.caption || body.name || 'Yangi qism'} #film #dodakino`;

        const data = await EpisodeService.createEpisode(body, videoLocalPath, caption);

        res.status(201).json({ success: true, data });
    }),

    updateEpisode: catchAsync(async (req, res, next) => {
        const { id } = req.params;
        const body = req.body;
        
        const data = await EpisodeService.updateEpisode(id, body);
        res.status(200).json({ success: true, data });
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

    deleteEpisode: catchAsync(async (req, res) => {
        const { id } = req.params;
        const data = await EpisodeService.deleteEpisode(id);
        res.status(200).json({ success: true, data });
    }),
}