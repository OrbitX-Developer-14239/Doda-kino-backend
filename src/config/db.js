import mongoose from "mongoose"
import { CONFIG } from "./index.js"

export const CONNECTION_OPTIONS = {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    // Baza nomi ATAYLAB bu yerda yo'q — u har ulanish uchun alohida
    // beriladi (tenant-registry). Ikki bot bitta clusterda, lekin turli
    // bazalarda ishlashi mumkin. URI larda yo'l qismi bo'lmagani uchun
    // dbName ko'rsatilmasa Mongoose "test" bazasiga yozib yuboradi.
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
export const mainConn = mongoose.createConnection(CONFIG.MONGO_URI_MAIN, {
    ...CONNECTION_OPTIONS,
    dbName: "dodakino",
});

export const connectDB = async () => {
    try {
        await mainConn.asPromise();
        console.log(`MAIN cluster (admins/bots/logs) ulandi: ${mainConn.host}`);
    } catch (error) {
        console.error(`❌ MAIN cluster ulanishida xatolik: ${error.message}`);
        process.exit(1);
    }
}
