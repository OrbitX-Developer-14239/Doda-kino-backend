import app from "./index.js";
import { CONFIG } from "./config/index.js"
import { connectDB } from "./config/db.js";
import { AdminService } from "./services/admin.service.js";
import { AIService } from "./services/ai.service.js";

const startServer = async () => {
    try {
        await connectDB()
        await AdminService.initSuperAdmin()

        await AIService.init()

        app.listen(CONFIG.PORT, () => {
            console.log(`Server running on http://localhost:${CONFIG.PORT}`);
        })
    } catch (error) {
        console.log(`Error connection with DB: ${error}`)
    }
}

startServer()
