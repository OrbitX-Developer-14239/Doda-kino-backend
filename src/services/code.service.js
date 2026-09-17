import { requireTenant } from "../core/tenant-context.js";
import { codeSpaceStores } from "../core/tenant-registry.js";

// Validatsiyadagi chegaralar bilan bir xil bo'lishi shart
export const FILM_CODE_MIN = 50000;
export const EPISODE_CODE_MIN = 100;

/**
 * Film kodi 10 qadam bilan: 50000, 50010, 50020 ...
 * Bittalab (51234) eslab qolish va yozish noqulay, 10 ga karrali (51230)
 * esa qulayroq. Qism kodi bittalab qoladi.
 */
const FILM_CODE_STEP = 10;
const EPISODE_CODE_STEP = 1;

/**
 * Band bo'lmagan kodlarni tanlaydi — ENG KICHIK bo'sh raqamdan, bittalab.
 *
 * Ilgari mavjud eng katta koddan keyin qidirilardi va film kodi 50 ga
 * oshib borardi (51200, 51250, ...). Kodlar tez kattalashib ketardi,
 * oradagi bo'sh raqamlar esa hech qachon ishlatilmasdi. Foydalanuvchi
 * botga kodni qo'lda yozadi — qisqa kod qulayroq.
 *
 * Endi: film 50000 dan (10 qadam bilan), qism 100 dan (bittalab) boshlab
 * birinchi band bo'lmagan raqam olinadi. Mavjud kodlarga tegilmaydi, ular shunchaki o'tkazib
 * yuboriladi.
 *
 * DIQQAT: o'chirilgan filmning kodi ham bo'shaydi va keyingi yangi filmga
 * berilishi mumkin — eski kodni eslab qolgan odam boshqa filmni ko'radi.
 */
const pickFreeCodes = (takenSet, min, count, step = 1) => {
    const picked = [];
    for (let candidate = min; picked.length < count; candidate += step) {
        if (!takenSet.has(candidate)) picked.push(candidate);
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
        return pickFreeCodes(await takenCodes("Film"), FILM_CODE_MIN, count, FILM_CODE_STEP);
    },

    /** Bo'sh epizod kodlari (>= 100) */
    async nextEpisodeCodes(count = 1) {
        return pickFreeCodes(await takenCodes("Episode"), EPISODE_CODE_MIN, count, EPISODE_CODE_STEP);
    },

    /** Kod maydonida shu kod allaqachon bandmi */
    async isFilmCodeTaken(code) {
        return (await takenCodes("Film")).has(Number(code));
    },

    async isEpisodeCodeTaken(code) {
        return (await takenCodes("Episode")).has(Number(code));
    },
};
