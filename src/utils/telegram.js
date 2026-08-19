import { requireTenant } from "../core/tenant-context.js";

/**
 * Joriy so'rov qaysi botga tegishli bo'lsa, o'sha botning grammY Api obyekti.
 *
 * MULTIBOT: har botning o'z tokeni bor (.env da), Api obyekti tenant
 * yaratilganda bir marta quriladi va qayta ishlatiladi. Ilgari token
 * bazadan o'qilardi — endi bazaga murojaat umuman yo'q.
 *
 * async qoldirildi — chaqiruvchi kodning barchasi `await getBotApi()` deb
 * yozilgan, imzoni o'zgartirish shart emas.
 */
export const getBotApi = async () => {
    const tenant = requireTenant("getBotApi");
    return tenant.api;
};
