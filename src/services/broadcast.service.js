import { BroadcastModel } from "../models/broadcast.model.js";
import { getTenant, allTenants } from "../core/tenant-registry.js";
import { logger } from "../utils/logger.js";

/**
 * ============================================
 *  Reklama tarqatish
 * ============================================
 *
 * NEGA BACKEND QILADI, BOT EMAS:
 * Bitta reklama bir nechta botning foydalanuvchilariga ketishi mumkin,
 * lekin bot faqat O'ZIGA yozgan odamga xabar yubora oladi. Backendda esa
 * hamma botning tokeni ham, foydalanuvchilari ham bor — shuning uchun
 * tarqatishni u boshqaradi.
 *
 * TEZLIK: Telegram bitta botdan sekundiga ~30 xabarga ruxsat beradi.
 * Biz 25 tadan yuboramiz va har to'plamdan keyin biroz kutamiz — ya'ni
 * ~20 xabar/sek. Bu chegaradan pastda turadi va 55 000 foydalanuvchiga
 * ~45 daqiqada yetib boradi. Chegaradan oshsak Telegram 429 qaytarib
 * butun botni vaqtincha jazolaydi — bu oddiy foydalanuvchilarning
 * qidiruviga ham ta'sir qilardi, shuning uchun ataylab ehtiyotkor tezlik.
 */

const BATCH_SIZE = 25;          // bir vaqtda nechta xabar
const BATCH_PAUSE_MS = 1100;    // to'plamlar orasidagi tanaffus
const MAX_RETRY_WAIT_S = 60;    // 429 da bundan uzoq kutilmaydi

/**
 * Reklama YUBORILMAYDIGAN foydalanuvchilar.
 *
 * VAQTINCHA shu yerda qattiq yozilgan — keyinchalik bazaga (yoki panelga)
 * ko'chiriladi va dinamik boshqariladi. Shu sababli ro'yxat bitta joyda
 * turibdi: ko'chirishda faqat shu qiymatni almashtirish kifoya.
 *
 * telegram_id bazada SATR sifatida saqlanadi — solishtirish ishlashi uchun
 * bu yerda ham satr bo'lishi shart.
 */
const EXCLUDED_USER_IDS = ["791067564", "5151295739"];

/**
 * YUBORISH filtri — kimga haqiqatan xabar ketadi.
 * Bloklaganlar chiqarib tashlanadi: ularga yuborish har doim xato beradi.
 */
const audienceFilter = () => ({
    blocked: { $ne: true },
    unreachable: { $ne: true },
    telegram_id: { $nin: EXCLUDED_USER_IDS },
});

/**
 * KO'RSATISH filtri — tanlash oynasida qaysi raqam chiqadi.
 *
 * Bloklaganlar ham SANALADI: ular baribir botni bir marta ochgan,
 * ya'ni haqiqiy auditoriyaning bir qismi. Faqat botga hech qachon
 * yozmaganlar (kanaldan kelib qolgan yozuvlar) sanalmaydi — aks holda
 * raqam 56 ming bo'lib chiqib, hech qanday ma'no bermasdi.
 *
 * Shu sababli ko'rsatilgan son yuborilganidan biroz katta bo'lishi
 * mumkin — farqi hisobotdagi "Bloklagan" ustunida ko'rinadi.
 */
const audienceCountFilter = () => ({
    unreachable: { $ne: true },
    telegram_id: { $nin: EXCLUDED_USER_IDS },
});

let isRunning = false;          // rejalashtiruvchi o'zini bosib ketmasin

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const BroadcastService = {
    /** Tanlash uchun botlar ro'yxati (har birida foydalanuvchi soni bilan) */
    async listTargets() {
        const out = [];
        for (const tenant of allTenants()) {
            if (!tenant.active) continue;
            let users = 0;
            try {
                users = await tenant.models.User.countDocuments(audienceCountFilter());
            } catch { /* baza javob bermasa 0 ko'rsatamiz */ }
            out.push({ botId: tenant.botId, username: tenant.username, users });
        }
        return out;
    },

    async create({ sourceChatId, sourceMessageId, botIds, totalRuns, intervalHours, createdBy, reporterBotId }) {
        const known = new Set(allTenants().map((t) => t.botId));
        const targets = [...new Set((botIds || []).map(Number))].filter((id) => known.has(id));

        if (!targets.length) {
            const error = new Error("Birorta ham mavjud bot tanlanmadi");
            error.status = 400;
            throw error;
        }

        const job = await BroadcastModel.create({
            sourceChatId: String(sourceChatId),
            sourceMessageId: Number(sourceMessageId),
            botIds: targets,
            totalRuns: Number(totalRuns),
            intervalHours: Number(intervalHours) || 0,
            nextRunAt: new Date(),      // birinchi yuborish darhol
            createdBy: createdBy || null,
            reporterBotId: reporterBotId || null,
        });

        logger.info(
            `[Reklama] Yangi tarqatma ${job._id}: ${targets.length} ta bot, ` +
            `${job.totalRuns} marta, ${job.intervalHours} soatda bir`
        );

        // Javobni kutmasdan qaytaramiz — yuborish fonda ketadi
        this.runDue().catch((e) => logger.error(`[Reklama] runDue xatosi: ${e.message}`));

        return job;
    },

    /** Oxirgi tarqatmalar (panel va nazorat uchun) */
    async recent(limit = 20) {
        return BroadcastModel.find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .select("botIds totalRuns intervalHours runsDone status nextRunAt runs createdAt")
            .lean();
    },

    async cancel(id) {
        const job = await BroadcastModel.findById(id);
        if (!job) {
            const error = new Error("Tarqatma topilmadi");
            error.status = 404;
            throw error;
        }
        job.status = "cancelled";
        await job.save();
        return job;
    },

    /** Muddati kelgan tarqatmalar — server.js dan har daqiqada chaqiriladi */
    async runDue() {
        if (isRunning) return;      // oldingisi hali tugamagan
        isRunning = true;

        try {
            const due = await BroadcastModel.find({
                status: { $in: ["pending", "running"] },
                nextRunAt: { $lte: new Date() },
            }).limit(3);

            for (const job of due) {
                await this._executeRun(job).catch((e) =>
                    logger.error(`[Reklama] ${job._id} bajarilmadi: ${e.message}`)
                );
            }
        } finally {
            isRunning = false;
        }
    },

    async _executeRun(job) {
        job.status = "running";
        await job.save();

        const run = { startedAt: new Date(), sent: 0, failed: 0, blocked: 0, unreachable: 0, perBot: [] };
        logger.info(`[Reklama] ${job._id} — ${job.runsDone + 1}/${job.totalRuns}-yuborish boshlandi`);

        for (const botId of job.botIds) {
            const tenant = getTenant(botId);
            if (!tenant?.active) {
                logger.warn(`[Reklama] Bot ${botId} faol emas — o'tkazib yuborildi`);
                continue;
            }

            const stat = await this._sendToTenant(tenant, job);
            run.sent += stat.sent;
            run.failed += stat.failed;
            run.blocked += stat.blocked;
            run.unreachable += stat.unreachable;
            run.perBot.push({ botId, ...stat });
        }

        run.finishedAt = new Date();

        const fresh = await BroadcastModel.findById(job._id);
        if (!fresh || fresh.status === "cancelled") return;   // orada bekor qilingan

        fresh.runs.push(run);
        fresh.runsDone += 1;

        if (fresh.runsDone >= fresh.totalRuns) {
            fresh.status = "done";
        } else {
            fresh.status = "pending";
            fresh.nextRunAt = new Date(Date.now() + fresh.intervalHours * 3600000);
        }
        await fresh.save();

        logger.info(
            `[Reklama] ${job._id} — yuborildi: ${run.sent}, xato: ${run.failed}, ` +
            `bloklagan: ${run.blocked}` +
            (fresh.status === "done" ? " (tugadi)" : ` (keyingisi: ${fresh.nextRunAt.toISOString()})`)
        );

        await this._report(fresh, run).catch((e) =>
            logger.warn(`[Reklama] Hisobot yuborilmadi: ${e.message}`)
        );
    },

    /**
     * Reklama kanalidagi ASL POSTGA javob qilib natijani yozadi.
     *
     * Hisobotni tarqatmani boshlagan bot yuboradi — faqat u reklama
     * kanalida turadi. Boshqa botlar u yerga yoza olmaydi va yozishi
     * ham shart emas.
     */
    async _report(job, run) {
        const reporter = getTenant(job.reporterBotId);
        if (!reporter?.active) return;

        const nice = (n) => Number(n).toLocaleString("uz-UZ");

        const perBot = run.perBot
            .map((b) => {
                const t = getTenant(b.botId);
                const name = t?.username ? `@${t.username}` : b.botId;
                return `${name} — ${nice(b.sent)} ta`;
            })
            .join("\n");

        const isLast = job.status === "done";

        const header = isLast
            ? "🏁 <b>Tarqatish tugadi</b>"
            : `✅ <b>${job.runsDone}/${job.totalRuns}-yuborish tugadi</b>`;

        const tail = isLast
            ? ""
            : `\n\n⏭ <i>Keyingisi: ${job.intervalHours} soatdan keyin</i>`;

        const text =
            `${header}\n\n` +
            `<blockquote><b>📤 Yuborildi:</b> ${nice(run.sent)} ta foydalanuvchiga\n` +
            `<b>🚫 Bloklagan:</b> ${nice(run.blocked)}\n` +
            `<b>👻 Botga yozmagan:</b> ${nice(run.unreachable || 0)}\n` +
            `<b>⚠️ Xato:</b> ${nice(run.failed)}</blockquote>\n\n` +
            `<blockquote>${perBot}</blockquote>${tail}`;

        await reporter.api.sendMessage(job.sourceChatId, text, {
            parse_mode: "HTML",
            reply_parameters: {
                message_id: job.sourceMessageId,
                allow_sending_without_reply: true,
            },
        });
    },

    /** Bitta botning barcha foydalanuvchilariga yuboradi */
    async _sendToTenant(tenant, job) {
        const stat = { sent: 0, failed: 0, blocked: 0, unreachable: 0 };

        // Kursor bilan: 55 000 foydalanuvchini birdan xotiraga olmaymiz
        const cursor = tenant.models.User
            .find(audienceFilter())
            .select("telegram_id")
            .lean()
            .cursor();

        let batch = [];
        const flush = async () => {
            if (!batch.length) return;
            const ids = batch;
            batch = [];
            await Promise.all(ids.map((uid) => this._sendOne(tenant, job, uid, stat)));
            await sleep(BATCH_PAUSE_MS);
        };

        for await (const user of cursor) {
            batch.push(user.telegram_id);
            if (batch.length >= BATCH_SIZE) await flush();
        }
        await flush();

        return stat;
    },

    async _sendOne(tenant, job, userId, stat, attempt = 0) {
        try {
            // copyMessage — "Forwarded from" yozuvisiz, xuddi botning
            // o'z xabaridek ko'rinadi
            await tenant.api.copyMessage(userId, job.sourceChatId, job.sourceMessageId);
            stat.sent++;
        } catch (error) {
            const code = error?.error_code ?? error?.parameters?.error_code;
            const desc = String(error?.description || error?.message || "");
            const retryAfter = error?.parameters?.retry_after;

            // 429 — juda tez yubordik, Telegram kutishni so'rayapti
            if (code === 429 && retryAfter && attempt < 2) {
                await sleep(Math.min(retryAfter, MAX_RETRY_WAIT_S) * 1000);
                return this._sendOne(tenant, job, userId, stat, attempt + 1);
            }

            // 403 IKKI XIL ma'noda keladi — matnidan ajratamiz:
            //
            //   "bot was blocked by the user"          -> haqiqatan bloklagan
            //   "bot can't initiate conversation..."   -> botga hech qachon yozmagan
            //   "user is deactivated"                  -> akkaunt o'chirilgan
            //
            // Ilgari hammasi "bloklagan" deb sanalardi va hisobot chalg'itardi:
            // 363 ta "bloklagan" ning 345 tasi aslida botni ochmagan odamlar edi.
            if (code === 403) {
                const neverStarted = /can't initiate conversation|user is deactivated|bot was kicked/i.test(desc);

                if (neverStarted) {
                    stat.unreachable++;
                    this._markUser(tenant, userId, { unreachable: true });
                } else {
                    stat.blocked++;
                    this._markUser(tenant, userId, { blocked: true });
                }
                return;
            }

            // 400 "chat not found" — bu odam botga HECH QACHON yozmagan.
            // Bunday yozuvlar majburiy obuna kanaliga qo'shilganlardan
            // paydo bo'ladi: bot ularni bazaga yozadi, lekin Telegram
            // qoidasi bo'yicha suhbatni BOT boshlay olmaydi.
            //
            // Belgilab qo'yamiz — aks holda HAR tarqatmada o'sha o'n
            // minglab yozuvga befoyda so'rov ketaveradi va tarqatma
            // soatlab cho'ziladi.
            if (code === 400 && /chat not found|user is deactivated|PEER_ID_INVALID/i.test(desc)) {
                stat.unreachable++;
                this._markUser(tenant, userId, { unreachable: true });
                return;
            }

            stat.failed++;
        }
    },

    /** Foydalanuvchi holatini belgilaydi (yuborishni sekinlashtirmasin) */
    _markUser(tenant, userId, patch) {
        tenant.models.User
            .updateOne({ telegram_id: String(userId) }, { $set: patch })
            .catch(() => { });
    },
};
