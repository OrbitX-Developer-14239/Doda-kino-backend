import { runWithTenant } from "../core/tenant-context.js";
import { getTenant, getDefaultTenant } from "../core/tenant-registry.js";

/**
 * So'rov qaysi botga tegishli ekanini URL dan aniqlaydi.
 *
 *   /api/8288956451/film/...  -> 8288956451-bot, URL /film/... ga qisqaradi
 *   /api/film/...             -> asosiy (birinchi) bot — admin panel va
 *                                eski mijozlar buzilmasligi uchun
 *
 * Aniqlangan tenant AsyncLocalStorage ga joylanadi — undan keyingi barcha
 * kod (servislar, modellar, kesh) aynan shu botning resurslari bilan ishlaydi.
 */
export const tenantMiddleware = (req, res, next) => {
    // Telegram bot ID lari katta raqamlar (kamida 8 xona) — "film", "admin"
    // kabi segmentlar bilan hech qachon to'qnashmaydi.
    const match = req.url.match(/^\/(\d{6,})(?=\/|$)/);

    let tenant;
    if (match) {
        tenant = getTenant(match[1]);
        if (!tenant) {
            return res.status(404).json({
                success: false,
                message: `Bunday bot ro'yxatdan o'tmagan: ${match[1]}`,
            });
        }
        // Bot prefiksini olib tashlaymiz: keyingi routerlar oddiy
        // /film, /episode ... yo'llarini ko'radi.
        req.url = req.url.slice(match[1].length + 1) || "/";
    } else {
        tenant = getDefaultTenant();
        if (!tenant) {
            return res.status(503).json({
                success: false,
                message: "Birorta ham bot sozlanmagan",
            });
        }
    }

    if (!tenant.active) {
        return res.status(503).json({
            success: false,
            message: `Bot ${tenant.botId} bazasi hozircha ulanmagan. .env dagi URI larni tekshiring.`,
        });
    }

    req.tenant = tenant;
    runWithTenant(tenant, next);
};
