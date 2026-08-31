import "dotenv/config";
import { connectDB, mainConn } from "../src/config/db.js";
import { initTenants, allTenants, getTenant, closeTenants } from "../src/core/tenant-registry.js";

/**
 * ============================================
 *  Haqiqiy auditoriyani aniqlash
 * ============================================
 *
 * Bazadagi har bir foydalanuvchiga JIM proba yuboradi va botga
 * yetib boradiganlarini aniqlaydi. HECH QANDAY XABAR YUBORILMAYDI —
 * faqat "yozmoqda" signali (sendChatAction), u ham bir lahzada yo'qoladi.
 *
 * NEGA KERAK:
 * Majburiy obuna kanaliga qo'shilgan odam ham bazaga foydalanuvchi
 * bo'lib tushadi (chatMember hodisasi orqali), lekin u botga hech qachon
 * yozmagan bo'lishi mumkin. Telegram qoidasi bo'yicha suhbatni BOT
 * boshlay olmaydi — bunday odamga reklama ham, xabar ham bormaydi.
 *
 * Topilganlar bazada belgilanadi:
 *   blocked     — botni bloklagan (403)
 *   unreachable — botga hech qachon yozmagan (400)
 *
 * Shundan keyin reklama tarqatish FAQAT haqiqiy foydalanuvchilarga
 * boradi va soatlab emas, daqiqalarda tugaydi.
 *
 * Ishlatish:
 *   node scripts/audience-scan.mjs              # hamma bot
 *   node scripts/audience-scan.mjs 8887969510   # bitta bot
 */

const BATCH_SIZE = 25;
const BATCH_PAUSE_MS = 1100;     // ~22 proba/sek — Telegram chegarasidan past
const PROGRESS_EVERY = 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const probe = async (tenant, userId) => {
    try {
        await tenant.api.sendChatAction(userId, "typing");
        return "ok";
    } catch (error) {
        const code = error?.error_code ?? error?.parameters?.error_code;
        const desc = String(error?.description || error?.message || "");
        const retryAfter = error?.parameters?.retry_after;

        if (code === 429 && retryAfter) {
            await sleep(Math.min(retryAfter, 60) * 1000);
            return probe(tenant, userId);          // qayta urinamiz
        }
        if (code === 403) return "blocked";
        if (code === 400 && /chat not found|PEER_ID_INVALID|user is deactivated/i.test(desc)) {
            return "unreachable";
        }
        return "error";
    }
};

const scanTenant = async (tenant) => {
    const User = tenant.models.User;
    const total = await User.countDocuments();

    console.log(`\n=== @${tenant.username || tenant.botId} — ${total} ta yozuv ===`);

    const stat = { ok: 0, blocked: 0, unreachable: 0, error: 0, done: 0 };
    const toMark = { blocked: [], unreachable: [] };

    const flushMarks = async () => {
        for (const flag of ["blocked", "unreachable"]) {
            if (!toMark[flag].length) continue;
            await User.updateMany(
                { telegram_id: { $in: toMark[flag] } },
                { $set: { [flag]: true } }
            ).catch(() => { });
            toMark[flag] = [];
        }
    };

    const cursor = User.find().select("telegram_id").lean().cursor();
    let batch = [];

    const runBatch = async () => {
        if (!batch.length) return;
        const ids = batch;
        batch = [];

        const results = await Promise.all(ids.map((id) => probe(tenant, id)));

        results.forEach((r, i) => {
            stat[r]++;
            stat.done++;
            if (r === "blocked" || r === "unreachable") toMark[r].push(String(ids[i]));
        });

        if (toMark.blocked.length + toMark.unreachable.length >= 500) await flushMarks();

        if (stat.done % PROGRESS_EVERY < BATCH_SIZE) {
            const pct = ((stat.done / total) * 100).toFixed(1);
            console.log(
                `  ${stat.done}/${total} (${pct}%) — haqiqiy: ${stat.ok}, ` +
                `yozmagan: ${stat.unreachable}, bloklagan: ${stat.blocked}, xato: ${stat.error}`
            );
        }

        await sleep(BATCH_PAUSE_MS);
    };

    for await (const u of cursor) {
        batch.push(u.telegram_id);
        if (batch.length >= BATCH_SIZE) await runBatch();
    }
    await runBatch();
    await flushMarks();

    console.log(
        `--- @${tenant.username || tenant.botId} YAKUN ---\n` +
        `  ✅ Haqiqiy foydalanuvchi : ${stat.ok}\n` +
        `  👻 Botga yozmagan        : ${stat.unreachable}\n` +
        `  🚫 Bloklagan             : ${stat.blocked}\n` +
        `  ⚠️  Aniqlanmagan xato     : ${stat.error}`
    );

    return stat;
};

const run = async () => {
    await connectDB();
    await initTenants();

    const only = process.argv[2] ? Number(process.argv[2]) : null;
    const targets = only
        ? [getTenant(only)].filter(Boolean)
        : allTenants().filter((t) => t.active);

    if (!targets.length) {
        console.error("Tekshirish uchun bot topilmadi");
        process.exit(1);
    }

    const started = Date.now();
    for (const tenant of targets) {
        if (!tenant.active) continue;
        await scanTenant(tenant);
    }

    console.log(`\nTugadi. Sarflangan vaqt: ${Math.round((Date.now() - started) / 60000)} daqiqa`);

    await Promise.all([mainConn.close(), closeTenants()]);
    process.exit(0);
};

run().catch((error) => {
    console.error("Xatolik:", error?.stack || error);
    process.exit(1);
});
