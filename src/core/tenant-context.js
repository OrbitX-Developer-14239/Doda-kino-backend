import { AsyncLocalStorage } from "async_hooks";

/**
 * ============================================
 *  Tenant (bot) konteksti
 * ============================================
 *
 * Backend bir nechta botga xizmat qiladi. Har so'rov qaysi botga
 * tegishli ekani URL dan aniqlanadi (/api/<botId>/...) va shu yerdagi
 * AsyncLocalStorage orqali BUTUN so'rov davomida ko'rinadigan qilinadi.
 *
 * NEGA ALS: 60+ joyda `FilmModel.find(...)` ko'rinishida ishlatilgan
 * servislarning har biriga tenant parametrini qo'l bilan uzatish o'rniga,
 * model importlari proxy'ga aylantirildi — proxy chaqiruv paytida joriy
 * tenant'ning modeliga yo'naltiradi. Servis kodi o'zgarishsiz qoladi.
 */

const als = new AsyncLocalStorage();

export const runWithTenant = (tenant, fn) => als.run(tenant, fn);

export const currentTenant = () => als.getStore() || null;

/** Tenant bo'lmasa aniq xato — jimgina noto'g'ri bazaga yozishdan yaxshi */
export const requireTenant = (what = "amal") => {
    const t = als.getStore();
    if (!t) {
        throw new Error(
            `Tenant konteksti yo'q (${what}). Bu kod so'rov tashqarisida chaqirilgan — ` +
            `runWithTenant(...) ichida chaqiring yoki tenant obyektidan to'g'ridan-to'g'ri foydalaning.`
        );
    }
    return t;
};

/**
 * Tenant'ga bog'liq Mongoose modelning proxy'si.
 *
 * `FilmModel.find(...)` chaqirilganda proxy joriy tenant'ning `models.Film`
 * modelini topib, chaqiruvni unga uzatadi. Shu tufayli servislar ilgarigidek
 * `import { FilmModel } from "../models/film.model.js"` qilib ishlayveradi.
 */
export const tenantModel = (name) =>
    new Proxy(Object.create(null), {
        get(_, prop) {
            const tenant = requireTenant(`${name}.${String(prop)}`);
            const model = tenant.models?.[name];
            if (!model) {
                throw new Error(`"${name}" modeli ${tenant.botId} bot uchun ro'yxatdan o'tmagan`);
            }
            const value = model[prop];
            return typeof value === "function" ? value.bind(model) : value;
        },
        has(_, prop) {
            const tenant = requireTenant(String(prop));
            return prop in (tenant.models?.[name] || {});
        },
    });

/** Tenant'dagi ixtiyoriy obyektga (masalan searchIndex) proxy */
export const tenantProp = (propName) =>
    new Proxy(Object.create(null), {
        get(_, prop) {
            const tenant = requireTenant(`${propName}.${String(prop)}`);
            const target = tenant[propName];
            if (!target) {
                throw new Error(`Tenant ${tenant.botId} da "${propName}" mavjud emas`);
            }
            const value = target[prop];
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
