import mongoose from "mongoose"
import { CONFIG } from "./index.js"

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(CONFIG.MONGO_URI)
        console.log(`Database muvaffaqiyatli ulandi: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ DB ulanishida xatolik: ${error.message}`)
        process.exit(1)
    }
}