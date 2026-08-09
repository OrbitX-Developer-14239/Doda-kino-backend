import { FilmModel } from "../models/film.model.js";
import { EpisodeModel } from "../models/episode.model.js";

// Validatsiyadagi chegaralar bilan bir xil bo'lishi shart
export const FILM_CODE_MIN = 50000;
export const EPISODE_CODE_MIN = 100;

const FILM_STEP = 50;
const EPISODE_STEP = 1;

/**
 * Band bo'lmagan kodlarni tanlaydi.
 *
 * Mavjud eng katta koddan boshlab yuqoriga qarab bo'sh joy qidiriladi —
 * shunda kodlar tartibli o'sib boradi va eski o'chirilgan kodlar qayta
 * ishlatilmaydi (bot foydalanuvchilari eski kodni yodda saqlagan bo'lishi mumkin).
 */
const pickFreeCodes = (takenSet, min, step, count) => {
    let candidate = min;
    for (const code of takenSet) {
        if (code >= candidate) candidate = code + step;
    }

    const picked = [];
    while (picked.length < count) {
        if (!takenSet.has(candidate)) {
            picked.push(candidate);
            takenSet.add(candidate);
        }
        candidate += step;
    }
    return picked;
};

export const CodeService = {
    /** Bo'sh film kodi (>= 50000) */
    async nextFilmCodes(count = 1) {
        const taken = new Set(
            (await FilmModel.find().select("code").lean()).map((f) => f.code)
        );
        return pickFreeCodes(taken, FILM_CODE_MIN, FILM_STEP, count);
    },

    /** Bo'sh epizod kodlari (>= 100) */
    async nextEpisodeCodes(count = 1) {
        const taken = new Set(
            (await EpisodeModel.find().select("code").lean()).map((e) => e.code)
        );
        return pickFreeCodes(taken, EPISODE_CODE_MIN, EPISODE_STEP, count);
    },
};
