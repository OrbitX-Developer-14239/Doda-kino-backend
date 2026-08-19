import "dotenv/config";
import { connectDB, mainConn } from "../src/config/db.js";
import { initTenants, allTenants, closeTenants } from "../src/core/tenant-registry.js";
import { AdminModel } from "../src/models/admin.model.js";
import { AuthSessionModel } from "../src/models/auth-session.model.js";
import { LogModel } from "../src/models/log.model.js";
import { BotModel } from "../src/models/bot.model.js";

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

// ATAYLAB syncIndexes() emas, createIndexes(): syncIndexes sxemada
// e'lon qilinmagan indekslarni O'CHIRADI, bu esa winston-mongodb o'zi
// yaratgan TTL indeksini yo'q qilib, loglar to'planib qolishiga olib kelardi.
const createFor = async (label, model) => {
    process.stdout.write(`🔧 ${label} indekslari yaratilmoqda... `);
    try {
        await model.createIndexes();
        console.log("✅");
    } catch (error) {
        console.log(`❌ ${error.message}`);
    }
};

const run = async () => {
    await connectDB();
    await initTenants();

    console.log("\n── MAIN cluster (umumiy) ──");
    for (const [label, model] of [
        ["admins", AdminModel],
        ["auth sessions", AuthSessionModel],
        ["logs", LogModel],
        ["bots", BotModel],
    ]) {
        await createFor(label, model);
    }

    for (const tenant of allTenants()) {
        console.log(`\n── Bot ${tenant.botId} ──`);
        if (!tenant.active) {
            console.log("  (ulanmagan — o'tkazib yuborildi)");
            continue;
        }

        await dropStaleTextIndexes(tenant.models.Film);
        for (const [label, model] of [
            ["films", tenant.models.Film],
            ["episodes", tenant.models.Episode],
            ["users", tenant.models.User],
            ["channels", tenant.models.Channel],
            ["discovered chats", tenant.models.DiscoveredChat],
        ]) {
            await createFor(label, model);
        }
    }

    await Promise.all([mainConn.close(), closeTenants()]);
    console.log("\n🎉 Indekslar sinxronlandi.");
    process.exit(0);
};

run().catch((error) => {
    console.error("❌ Xatolik:", error.message);
    process.exit(1);
});
