// Diqqat: ai.service.js (vektor qidiruv) ATAYLAB import qilinmaydi —
// u yuklansa HuggingFace ONNX modeli ~1.1 GB RAM egallaydi. Kod o'chirilmagan,
// shunchaki ishlatilmayapti; qidiruv endi search-index + Groq orqali ketadi.
import { FilmSearchService } from "../services/film-search.service.js";
import { AIMetadataService } from "../services/ai-metadata.service.js";
import { CodeService } from "../services/code.service.js";
import { FilmService } from "../services/film.service.js";
import { catchAsync } from "../utils/catchAsync.js";

export const FilmController = {
    /**
     * Kino nomidan AI yordamida to'ldirilgan ma'lumot + bo'sh kod qaytaradi.
     * Bazaga HECH NARSA yozmaydi — bu faqat forma uchun taklif.
     */
    aiSuggest: catchAsync(async (req, res) => {
        const { name, year, country, episodeCount = 1 } = req.body;

        // AI chaqiruvi va kod tanlash bir-biriga bog'liq emas — parallel ketadi
        const [film, [filmCode], episodeCodes] = await Promise.all([
            AIMetadataService.suggestFilm({ name, year, country }),
            CodeService.nextFilmCodes(1),
            CodeService.nextEpisodeCodes(episodeCount),
        ]);

        res.status(200).json({
            success: true,
            data: {
                film: { ...film, code: filmCode },
                episodeCodes,
            },
        });
    }),

    createFilm: catchAsync(async (req, res) => {
        const body = req.body

        const posterLocalPath = req.file?.path;
        const data = await FilmService.createFilm(body, posterLocalPath)

        res.status(201).json({ success: true, data })
    }),

    updateFilm: catchAsync(async (req, res) => {
        const { id } = req.params;
        const body = req.body;

        const posterLocalPath = req.file?.path;
        const data = await FilmService.updateFilm(id, body, posterLocalPath);
        res.status(200).json({ success: true, data });
    }),

    getFilmById: catchAsync(async (req, res) => {
        const data = await FilmService.getFilmById(req.params.id)
        if (!data) throw Object.assign(new Error("Film topilmadi"), { status: 404 });
        res.status(200).json({ success: true, data })
    }),

    getFilmsList: catchAsync(async (req, res) => {
        const page = parseInt(req.query.page) || 1
        const result = await FilmService.getAllFilmsPaginated(page)

        res.status(200).json({ success: true, ...result })
    }),

    searchByCode: catchAsync(async (req, res) => {
        const data = await FilmService.searchByCode(req.params.code)

        res.status(200).json({ success: true, data })
    }),

    searchByAi: catchAsync(async (req, res) => {
        const { query } = req.body
        const { films, source } = await FilmSearchService.search(query)

        // Qaysi bosqichda topilgani logga yoziladi — "index" bo'lsa Groq
        // umuman chaqirilmagan (tez va bepul)
        console.log(`🔎 [Qidiruv]: "${query}" -> ${films.length} ta (${source})`)

        res.status(200).json({ success: true, data: films })
    }),

    deleteFilm: catchAsync(async (req, res) => {
        const { id } = req.params;
        const result = await FilmService.deleteFilm(id);

        res.status(200).json({ success: true, ...result })
    }),
}