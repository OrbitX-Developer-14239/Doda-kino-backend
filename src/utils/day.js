/**
 * ============================================
 *  Kun chegaralari — Toshkent vaqti bo'yicha
 * ============================================
 *
 * Baza vaqtni UTC da saqlaydi, admin esa Toshkentda (+5) qaraydi.
 * Kun chegarasi UTC bo'yicha olinsa, soat 00:00–05:00 orasidagi hodisa
 * bir kun oldingi ustunga tushib qolardi.
 *
 * O'zbekistonda 1992-yildan beri yozgi vaqt yo'q — siljish doimiy +5,
 * shuning uchun kutubxona shart emas.
 */

export const TZ = "Asia/Tashkent";
export const TZ_OFFSET_MS = 5 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Sana -> Toshkent bo'yicha "YYYY-MM-DD" */
export const dayKey = (date) =>
    new Date(date.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);

/** Bugungi kun (Toshkent) */
export const todayKey = () => dayKey(new Date());

/** "YYYY-MM-DD" (Toshkent) -> o'sha kun boshining UTC vaqti */
export const dayStartUtc = (key) =>
    new Date(Date.parse(`${key}T00:00:00Z`) - TZ_OFFSET_MS);

/** Oraliqning birinchi kuni: bugundan `days` kun oldin (bugun ham kiradi) */
export const daysAgoKey = (days) =>
    dayKey(new Date(dayStartUtc(todayKey()).getTime() - (days - 1) * DAY_MS));

/**
 * `fromKey` dan bugungacha HAR kunning kaliti.
 * Hodisa bo'lmagan kunlar ham qaytadi — grafik chizig'i bo'sh kunlarni
 * sakrab o'tmasligi uchun ular nol bilan to'ldiriladi.
 */
export const dayRange = (fromKey) => {
    const keys = [];
    const end = todayKey();
    for (let t = dayStartUtc(fromKey).getTime(); ; t += DAY_MS) {
        const key = dayKey(new Date(t));
        if (key > end) break;
        keys.push(key);
    }
    return keys;
};
