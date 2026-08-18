import http from "http";
import app from "./index.js";
import { CONFIG } from "./config/index.js";
import { connectDB, conn1, conn2 } from "./config/db.js";
import { AdminService } from "./services/admin.service.js";
// ai.service.js (vektor qidiruv) ATAYLAB import qilinmaydi — u ~1.1 GB
// RAM egallaydi. Qidiruv endi xotiradagi indeks + Groq orqali ishlaydi.
import { SearchIndex } from "./services/search-index.service.js";
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
        await Promise.all([conn1.close(), conn2.close()]);
        logger.info("Barcha ulanishlar yopildi. Xayr!");
        process.exit(0);
    } catch (error) {
        logger.error(`Shutdown xatosi: ${error.message}`);
        process.exit(1);
    }
};

const startServer = async () => {
    try {
        await connectDB();
        await AdminService.initSuperAdmin();

        // Kesh bekor qilish uchun (yozish emas). Redis o'chiq bo'lsa
        // server baribir ishga tushadi — invalidatsiya jimgina o'tkaziladi.
        await cache.connect();

        server = http.createServer(app);
        initSocket(server);

        server.listen(CONFIG.PORT, () => {
            logger.info(`Server running on http://localhost:${CONFIG.PORT}`);

            // Amaldagi CORS sozlamasi loglarga chiqadi. pm2 muhit o'zgaruvchilarini
            // keshlaydi va dotenv mavjud qiymatlarni ustidan yozmaydi — shu sababli
            // .env tahrirlangani bilan eski ro'yxat ishlab turishi mumkin.
            // Bu qator qaysi ro'yxat HAQIQATDA kuchda ekanini darhol ko'rsatadi.
            logger.info(`CORS ruxsat etilgan manbalar: ${CONFIG.CORS_ORIGINS.join(", ") || "(bo'sh)"}`);
            logger.info(`CORS localhost (istalgan port): ${CONFIG.CORS_ALLOW_LOCALHOST ? "yoqilgan" : "o'chirilgan"}`);
        });

        // Qidiruv indeksi fon rejimida quriladi — listen() ni bloklamaydi
        SearchIndex.init()
            .then(({ source, count }) => {
                logger.info(`Qidiruv indeksi tayyor: ${count} ta film (${source})`);
            })
            .catch((error) => {
                logger.warn(`Qidiruv indeksini qurib bo'lmadi: ${error.message}`);
            });
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
