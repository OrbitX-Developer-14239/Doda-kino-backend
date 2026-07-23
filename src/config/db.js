import mongoose from "mongoose"
import { CONFIG } from "./index.js"

export const conn1 = mongoose.createConnection(CONFIG.MONGO_URI1);
export const conn2 = mongoose.createConnection(CONFIG.MONGO_URI2);

export const connectDB = async () => {
    try {
        await Promise.all([
            conn1.asPromise(),
            conn2.asPromise()
        ]);
        console.log(`Database 1 (Films/Episodes/Channels) ulandi: ${conn1.host}`);
        console.log(`Database 2 (Admins/Bots/Logs/Users) ulandi: ${conn2.host}`);
    } catch (error) {
        console.error(`❌ DB ulanishida xatolik: ${error.message}`);
        process.exit(1);
    }
}