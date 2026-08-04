import "dotenv/config";
import { connectDB, conn1, conn2 } from "../src/config/db.js";
import { FilmModel } from "../src/models/film.model.js";
import { EpisodeModel } from "../src/models/episode.model.js";
import { UserModel } from "../src/models/user.model.js";
import { LogModel } from "../src/models/log.model.js";
import { ChannelModel } from "../src/models/channels.model.js";
import { AdminModel } from "../src/models/admin.model.js";
import { AuthSessionModel } from "../src/models/auth-session.model.js";

const MODELS = [
    ["films", FilmModel],
    ["episodes", EpisodeModel],
    ["users", UserModel],
    ["logs", LogModel],
    ["channels", ChannelModel],
    ["admins", AdminModel],
    ["auth sessions", AuthSessionModel],
];

/**
 * MongoDB kolleksiyada faqat BITTA text indeksga ruxsat beradi.
 * Eski sxemada `name` va `originalName` uchun alohida text indekslar
 * e'lon qilingan edi, shuning uchun bazada eskisi qolgan bo'lishi mumkin —
 * yangi birlashtirilgan indeks yaratilishidan oldin uni olib tashlaymiz.
 */
const dropStaleTextIndexes = async (model) => {
    const desiredName = "name_text_originalName_text";
    let existing;

    try {
        existing = await model.collection.indexes();
    } catch {
        return;
    }

    for (const index of existing) {
        const isText = Object.values(index.key || {}).includes("text");
        if (isText && index.name !== desiredName) {
            console.log(`  ↳ eski text indeks o'chirilmoqda: ${index.name}`);
            await model.collection.dropIndex(index.name).catch((e) =>
                console.warn(`     o'chirib bo'lmadi: ${e.message}`)
            );
        }
    }
};

const run = async () => {
    await connectDB();

    await dropStaleTextIndexes(FilmModel);

    // ATAYLAB syncIndexes() emas, createIndexes(): syncIndexes sxemada
    // e'lon qilinmagan indekslarni O'CHIRADI, bu esa winston-mongodb o'zi
    // yaratgan TTL indeksini yo'q qilib, loglar to'planib qolishiga olib kelardi.
    for (const [label, model] of MODELS) {
        process.stdout.write(`🔧 ${label} indekslari yaratilmoqda... `);
        try {
            await model.createIndexes();
            console.log("✅");
        } catch (error) {
            console.log(`❌ ${error.message}`);
        }
    }

    await Promise.all([conn1.close(), conn2.close()]);
    console.log("\n🎉 Indekslar sinxronlandi.");
    process.exit(0);
};

run().catch((error) => {
    console.error("❌ Xatolik:", error.message);
    process.exit(1);
});
