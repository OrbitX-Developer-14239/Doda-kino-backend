import http from "http";
import app from "./index.js";
import { CONFIG } from "./config/index.js";
import { connectDB, conn1, conn2 } from "./config/db.js";
import { AdminService } from "./services/admin.service.js";
import { AIService } from "./services/ai.service.js";
import { initSocket, closeSocket } from "./socket.js";
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

        AIService.init().catch((error) => {
            logger.warn(`AI xizmatini ishga tushirib bo'lmadi: ${error.message}`);
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
