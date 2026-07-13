import http from "http";
import app from "./index.js";
import { CONFIG } from "./config/index.js";
import { connectDB } from "./config/db.js";
import { AdminService } from "./services/admin.service.js";
import { AIService } from "./services/ai.service.js";
import { initSocket } from "./socket.js";
import { logger } from "./utils/logger.js";

const startServer = async () => {
    try {
        await connectDB();
        await AdminService.initSuperAdmin();
        await AIService.init();

        const server = http.createServer(app);

        initSocket(server);

        server.listen(CONFIG.PORT, () => {
            logger.info(`Server running on http://localhost:${CONFIG.PORT}`);
        });
    } catch (error) {
        if (logger) {
            logger.error(`Error connection with DB: ${error}`);
        } else {
            console.error(`Error connection with DB: ${error}`);
        }
    }
};

startServer();
