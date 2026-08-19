import "dotenv/config";
import mongoose from "mongoose";

/**
 * ============================================
 *  Multibot migratsiyasi — FAQAT NUSXA KO'CHIRADI
 * ============================================
 *
 * HECH NARSA O'CHIRILMAYDI. Eski joylardagi ma'lumotlar joyida qoladi
 * (yangi kod ularni shunchaki ishlatmaydi).
 *
 * Ko'chirishlar (rasmdagi sxema bo'yicha):
 *   1-cluster (URI1, eski conn1):   films, episodes  -> JOYIDA QOLADI
 *   1.1-cluster (URI1.1, eski conn2): users          -> JOYIDA QOLADI
 *
 *   URI1  -> URI1.1 : channels, discoveredchats  (bot sozlamalari users bilan birga)
 *   URI1.1 -> MAIN  : admins, authsessions, server_logs  (umumiy narsalar)
 *
 * Skript IDEMPOTENT: qayta ishga tushirilsa mavjud hujjatlarni _id bo'yicha
 * yangilaydi, dublikat yaratmaydi. Deploy oldidan yana bir marta ishga
 * tushirish kerak — orada to'plangan yangi loglar/adminlar ham ko'chsin.
 *
 * Eslatma: bots kolleksiyasi ATAYLAB ko'chirilmaydi — yangi sxemada u
 * token saqlamaydi, server ishga tushganda o'zi registrni to'ldiradi.
 */

const opts = { serverSelectionTimeoutMS: 15000, dbName: "dodakino" };

const uri1 = process.env.MONGO_URI1;
const uri11 = process.env["MONGO_URI1.1"];
const uriMain = process.env.MONGO_URI_MAIN;

if (!uri1 || !uri11 || !uriMain) {
    console.error("MONGO_URI1, MONGO_URI1.1 va MONGO_URI_MAIN .env da bo'lishi shart");
    process.exit(1);
}

const c1 = mongoose.createConnection(uri1, opts);
const c11 = mongoose.createConnection(uri11, opts);
const cMain = mongoose.createConnection(uriMain, opts);

await Promise.all([c1.asPromise(), c11.asPromise(), cMain.asPromise()]);
console.log(`Ulandi: URI1=${c1.host}\n        URI1.1=${c11.host}\n        MAIN=${cMain.host}\n`);

/** Kolleksiyani _id bo'yicha upsert qilib ko'chiradi (o'chirmasdan) */
async function copyCollection(fromConn, toConn, name) {
    const from = fromConn.db.collection(name);
    const to = toConn.db.collection(name);

    const total = await from.countDocuments();
    if (!total) {
        console.log(`  ${name}: manbada bo'sh — o'tkazib yuborildi`);
        return;
    }

    let copied = 0;
    const cursor = from.find({});
    let batch = [];

    for await (const doc of cursor) {
        batch.push({
            replaceOne: { filter: { _id: doc._id }, replacement: doc, upsert: true },
        });
        if (batch.length >= 500) {
            await to.bulkWrite(batch, { ordered: false });
            copied += batch.length;
            batch = [];
        }
    }
    if (batch.length) {
        await to.bulkWrite(batch, { ordered: false });
        copied += batch.length;
    }

    const target = await to.countDocuments();
    console.log(`  ${name}: ${copied}/${total} ta ko'chirildi (maqsadda endi ${target} ta)`);
}

console.log("URI1 -> URI1.1 (bot sozlamalari users bilan birga):");
await copyCollection(c1, c11, "channels");
await copyCollection(c1, c11, "discoveredchats");

console.log("\nURI1.1 -> MAIN (umumiy narsalar):");
await copyCollection(c11, cMain, "admins");
await copyCollection(c11, cMain, "authsessions");
await copyCollection(c11, cMain, "server_logs");

console.log("\n✅ Migratsiya tugadi. Eski joylardagi ma'lumotlarga TEGILMADI.");
await Promise.all([c1.close(), c11.close(), cMain.close()]);
process.exit(0);
