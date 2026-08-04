import mongoose from "mongoose"
import { CONFIG } from "./index.js"

const options = {
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    // Production da indekslar har ishga tushishda avtomatik yaratilmaydi —
    // buning uchun alohida `npm run sync-indexes` buyrug'i bor.
    autoIndex: !CONFIG.IS_PRODUCTION,
};

export const conn1 = mongoose.createConnection(CONFIG.MONGO_URI1, options);
export const conn2 = mongoose.createConnection(CONFIG.MONGO_URI2, options);

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
