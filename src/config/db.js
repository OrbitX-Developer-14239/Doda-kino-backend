import mongoose from "mongoose"
import { CONFIG } from "./index.js"

export const CONNECTION_OPTIONS = {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    // Hamma clusterda bir xil baza nomi ishlatiladi. Bu ayniqsa yangi
    // clusterlar uchun muhim: ularning URI sida yo'l qismi yo'q va usiz
    // Mongoose hammasini "test" bazasiga yozib yuborardi.
    dbName: "dodakino",
    // Production da indekslar har ishga tushishda avtomatik yaratilmaydi —
    // buning uchun alohida `npm run sync-indexes` buyrug'i bor.
    autoIndex: !CONFIG.IS_PRODUCTION,
};

/**
 * MAIN cluster — barcha botlar uchun UMUMIY narsalar:
 * admins, authsessions, bots (registr), server_logs.
 *
 * Har botning o'z clusterlariga ulanish core/tenant-registry.js da.
 */
export const mainConn = mongoose.createConnection(CONFIG.MONGO_URI_MAIN, CONNECTION_OPTIONS);

export const connectDB = async () => {
    try {
        await mainConn.asPromise();
        console.log(`MAIN cluster (admins/bots/logs) ulandi: ${mainConn.host}`);
    } catch (error) {
        console.error(`❌ MAIN cluster ulanishida xatolik: ${error.message}`);
        process.exit(1);
    }
}
