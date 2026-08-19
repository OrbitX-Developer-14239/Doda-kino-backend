import http from "http";
import app from "./index.js";
import { CONFIG } from "./config/index.js";
import { connectDB, mainConn } from "./config/db.js";
import { initTenants, allTenants, closeTenants } from "./core/tenant-registry.js";
import { AdminService } from "./services/admin.service.js";
import { BotService } from "./services/bot.service.js";
// ai.service.js (vektor qidiruv) ATAYLAB import qilinmaydi — u ~1.1 GB
// RAM egallaydi. Qidiruv endi xotiradagi indeks + Groq orqali ishlaydi.
import { initSocket, closeSocket } from "./socket.js";
import { cache } from "./services/cache.service.js";
import { logger } from "./utils/logger.js";

let server;

const shutdown = async (signal) => {
    logger.info(`${signal} qabul qilindi — server to'xtatilmoqda...`);

    const timer = setTimeout(() => {
        logger.error("Graceful shutdown 10s ichida tugamadi — majburiy chiqish.");
        process.exit(1);
    }, 10_000);
    timer.unref();

    try {
        if (server) await new Promise((resolve) => server.close(resolve));
        await closeSocket();
        await cache.disconnect();
        await Promise.all([mainConn.close(), closeTenants()]);
        logger.info("Barcha ulanishlar yopildi. Xayr!");
        process.exit(0);
    } catch (error) {
        logger.error(`Shutdown xatosi: ${error.message}`);
        process.exit(1);
    }
};

const startServer = async () => {
    try {
        // MAIN cluster (admins/bots/logs) — usiz server ma'nosiz, ulanmasa chiqiladi
        await connectDB();

        // Har botning o'z clusterlari. Bittasi ulanmasa server YIQILMAYDI —
        // o'sha bot 503 qaytaradi, qolganlari ishlayveradi.
        await initTenants();

        await AdminService.initSuperAdmin();

        // Kesh bekor qilish uchun (yozish emas). Redis o'chiq bo'lsa
        // server baribir ishga tushadi — invalidatsiya jimgina o'tkaziladi.
        await cache.connect();

        server = http.createServer(app);
        initSocket(server);

        server.listen(CONFIG.PORT, () => {
            logger.info(`Server running on http://localhost:${CONFIG.PORT}`);

            const active = allTenants().filter((t) => t.active);
            logger.info(`Botlar: ${allTenants().length} ta sozlangan, ${active.length} ta faol (${active.map((t) => t.botId).join(", ")})`);

            // Amaldagi CORS sozlamasi loglarga chiqadi. pm2 muhit o'zgaruvchilarini
            // keshlaydi va dotenv mavjud qiymatlarni ustidan yozmaydi — shu sababli
            // .env tahrirlangani bilan eski ro'yxat ishlab turishi mumkin.
            // Bu qator qaysi ro'yxat HAQIQATDA kuchda ekanini darhol ko'rsatadi.
            logger.info(`CORS ruxsat etilgan manbalar: ${CONFIG.CORS_ORIGINS.join(", ") || "(bo'sh)"}`);
            logger.info(`CORS localhost (istalgan port): ${CONFIG.CORS_ALLOW_LOCALHOST ? "yoqilgan" : "o'chirilgan"}`);
        });

        // Fon ishlari — listen() ni bloklamaydi:
        // 1) Botlar registri (username lar Telegram dan olinadi)
        BotService.syncRegistry().catch((error) => {
            logger.warn(`Bot registrini yangilab bo'lmadi: ${error.message}`);
        });

        // 2) Har faol botning qidiruv indeksi
        for (const tenant of allTenants()) {
            if (!tenant.active) continue;
            tenant.searchIndex.init()
                .then(({ source, count }) => {
                    logger.info(`Qidiruv indeksi [bot ${tenant.botId}]: ${count} ta film (${source})`);
                })
                .catch((error) => {
                    logger.warn(`Qidiruv indeksi [bot ${tenant.botId}] qurilmadi: ${error.message}`);
                });
        }
    } catch (error) {
        logger.error(`Serverni ishga tushirishda xato: ${error?.stack || error}`);
        process.exit(1);
    }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
    logger.error(`Ushlanmagan promise rad etildi: ${reason?.stack || reason}`);
});

process.on("uncaughtException", (error) => {
    logger.error(`Ushlanmagan istisno: ${error?.stack || error}`);
    shutdown("uncaughtException");
});

startServer();
