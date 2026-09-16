import { FilmModel } from "../models/film.model.js";
import { EpisodeModel } from "../models/episode.model.js";
import { ViewStatModel } from "../models/view-stat.model.js";
import { mergedStores, mergedFilmByCode, mergedEpisodesByCodes } from "../core/content-merge.js";
import { dayRange, daysAgoKey, todayKey } from "../utils/day.js";

/**
 * ============================================
 *  Bitta filmning ko'rilish statistikasi
 * ============================================
 *
 * IKKI XIL RAQAM BOR VA ULAR TENG EMAS:
 *
 *   `total`   — film hujjatidagi jami hisoblagich. U BOSHIDAN BERI
 *               yig'ilgan, lekin kun bo'yicha taqsimoti yo'q.
 *   `points`  — kunlik hisob. U faqat shu xizmat qo'shilgandan keyin
 *               to'plana boshlagan, ya'ni eski ko'rishlar unda yo'q.
 *
 * Shuning uchun ikkalasi grafikda ARALASHTIRILMAYDI: kunlik qatorlar
 * yig'indisi jami hisoblagichdan kichik bo'lishi normal holat va panel
 * buni ochiq yozadi.
 */

const MAX_RANGES = { 7: 7, 30: 30, 90: 90 };
export const ALLOWED_VIEW_RANGES = ["7", "30", "90", "all"];

export const FilmViewsService = {
    /** Tanlagich uchun: kodi, nomi va jami ko'rishi bilan filmlar ro'yxati */
    async listFilms(limit = 300) {
        const stores = mergedStores();
        const select = "code name views episodesCount";

        if (stores) {
            const lists = await Promise.all(
                stores.map((s) => s.Film.find().select(select).sort({ views: -1 }).limit(limit).lean())
            );
            return lists.flat().sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, limit);
        }

        return FilmModel.find().select(select).sort({ views: -1 }).limit(limit).lean();
    },

    /**
     * @param {number} code  film kodi
     * @param {"7"|"30"|"90"|"all"} range
     */
    async getFilmViews(code, range = "30") {
        const stores = mergedStores();
        const film = stores
            ? await mergedFilmByCode(stores, Number(code))
            : await FilmModel.findOne({ code: Number(code) }).lean();

        if (!film) {
            const error = new Error("Film topilmadi");
            error.status = 404;
            throw error;
        }

        const episodeCodes = (film.episodes || []).map((e) => e.code).filter((c) => c != null);

        // Kunlik hisob qachondan boshlangani — panel buni foydalanuvchiga yozadi
        const firstStat = await ViewStatModel.findOne().sort({ day: 1 }).select("day").lean();

        let fromKey;
        if (range === "all") {
            fromKey = firstStat?.day || todayKey();
        } else {
            fromKey = daysAgoKey(MAX_RANGES[range] || 30);
        }

        const [daily, episodes] = await Promise.all([
            ViewStatModel.aggregate([
                {
                    $match: {
                        day: { $gte: fromKey },
                        $or: [
                            { kind: "film", code: Number(film.code) },
                            { kind: "episode", code: { $in: episodeCodes } },
                        ],
                    },
                },
                { $group: { _id: { day: "$day", kind: "$kind" }, count: { $sum: "$count" } } },
            ]),
            // Qismlar bo'yicha taqsimot — jami hisoblagichdan (boshidan beri)
            episodeCodes.length
                ? (stores
                    ? mergedEpisodesByCodes(stores, episodeCodes)
                    : EpisodeModel.find({ code: { $in: episodeCodes } })
                        .select("code views episodeNumber season name")
                        .lean())
                : [],
        ]);

        const byDay = new Map();
        for (const row of daily) {
            const entry = byDay.get(row._id.day) || { film: 0, episode: 0 };
            entry[row._id.kind] = row.count;
            byDay.set(row._id.day, entry);
        }

        // Har kun alohida nuqta — ko'rish bo'lmagan kunlar ham nol bilan
        const points = dayRange(fromKey).map((day) => {
            const e = byDay.get(day) || { film: 0, episode: 0 };
            return { date: day, filmViews: e.film, episodeViews: e.episode, total: e.film + e.episode };
        });

        // Qismlar tartib bilan: fasl, keyin qism raqami
        const byEpisode = episodes
            .map((e) => ({
                code: e.code,
                season: e.season || 1,
                episodeNumber: e.episodeNumber,
                name: e.name,
                views: e.views || 0,
            }))
            .sort((a, b) => a.season - b.season || a.episodeNumber - b.episodeNumber);

        return {
            film: {
                code: film.code,
                name: film.name,
                views: film.views || 0,
                episodesCount: film.episodesCount || 0,
                seasonsCount: film.seasonsCount || 1,
            },
            range: { key: range, from: fromKey, to: todayKey(), days: points.length },
            // Kunlik hisob qachondan beri yig'ilyapti (null — hali umuman yo'q)
            trackingSince: firstStat?.day || null,
            totals: {
                // Boshidan beri (film hujjatidagi hisoblagich)
                allTime: film.views || 0,
                episodesAllTime: byEpisode.reduce((a, e) => a + e.views, 0),
                // Tanlangan oraliqda (kunlik hisobdan)
                inRange: points.reduce((a, p) => a + p.total, 0),
            },
            points,
            byEpisode,
        };
    },
};
