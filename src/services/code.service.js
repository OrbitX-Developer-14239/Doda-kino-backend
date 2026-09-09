import { requireTenant } from "../core/tenant-context.js";
import { codeSpaceStores } from "../core/tenant-registry.js";

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

/**
 * Band kodlar — joriy bot bilan BITTA kod maydonidagi hamma bazadan.
 *
 * NEGA FAQAT O'Z BAZASI YETMAYDI: aralash bot (masalan "Doda Media")
 * kino va multfilm bazalarini birlashtirib ko'rsatadi. Har baza o'zicha
 * kod tanlasa, ikkalasida ham 51200 paydo bo'lishi mumkin — aralash
 * botda esa foydalanuvchi 51200 yozganda qaysi biri kerakligini
 * aniqlab bo'lmaydi. Shuning uchun kod butun maydon bo'ylab yagona.
 */
const takenCodes = async (field) => {
    const stores = codeSpaceStores(requireTenant("kod tanlash"));
    const lists = await Promise.all(
        stores.map((s) => s[field].find().select("code").lean())
    );
    return new Set(lists.flat().map((d) => d.code));
};

export const CodeService = {
    /** Bo'sh film kodi (>= 50000) */
    async nextFilmCodes(count = 1) {
        return pickFreeCodes(await takenCodes("Film"), FILM_CODE_MIN, FILM_STEP, count);
    },

    /** Bo'sh epizod kodlari (>= 100) */
    async nextEpisodeCodes(count = 1) {
        return pickFreeCodes(await takenCodes("Episode"), EPISODE_CODE_MIN, EPISODE_STEP, count);
    },

    /** Kod maydonida shu kod allaqachon bandmi */
    async isFilmCodeTaken(code) {
        return (await takenCodes("Film")).has(Number(code));
    },

    async isEpisodeCodeTaken(code) {
        return (await takenCodes("Episode")).has(Number(code));
    },
};
