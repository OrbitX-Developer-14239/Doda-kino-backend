import "dotenv/config";
import mongoose from "mongoose";
import readline from "readline";

// Ulanish manzillari ENV dan olinadi.
// Ilgari bu yerda ikkita jonli Atlas paroli ochiq matn sifatida yozilgan va
// git ga commit qilingan edi.
const OLD_URI = process.env.MIGRATE_OLD_URI;
const NEW_URI = process.env.MIGRATE_NEW_URI || process.env.MONGO_URI1;

const confirm = (question) => new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase());
    });
});

async function migrate() {
    if (!OLD_URI || !NEW_URI) {
        console.error("❌ MIGRATE_OLD_URI va MIGRATE_NEW_URI (yoki MONGO_URI1) environment o'zgaruvchilari kerak.");
        process.exit(1);
    }

    try {
        console.log("🔄 Eski bazaga ulanilmoqda...");
        const oldConn = await mongoose.createConnection(OLD_URI).asPromise();
        console.log("✅ Eski bazaga ulandi.");

        console.log("🔄 Yangi bazaga ulanilmoqda...");
        const newConn = await mongoose.createConnection(NEW_URI).asPromise();
        console.log("✅ Yangi bazaga ulandi.");

        const oldFilmsColl = oldConn.db.collection('films');
        const oldEpisodesColl = oldConn.db.collection('episodes');

        const newFilmsColl = newConn.db.collection('films');
        const newEpisodesColl = newConn.db.collection('episodes');

        const films = await oldFilmsColl.find({}).toArray();
        const episodes = await oldEpisodesColl.find({}).toArray();

        console.log(`📦 Eski bazadan ${films.length} ta film va ${episodes.length} ta epizod yuklab olindi.`);

        const newFilmsCount = await newFilmsColl.countDocuments();
        if (newFilmsCount > 0) {
            // Ma'lumot o'chirish endi tasdiqlashsiz bajarilmaydi
            console.log(`\n⚠️  DIQQAT: yangi bazada ${newFilmsCount} ta film bor va ular O'CHIRILADI.`);
            console.log(`   Nishon: ${newConn.name}@${newConn.host}`);
            const answer = await confirm("   Davom etilsinmi? (ha/yo'q): ");
            if (answer !== "ha") {
                console.log("Bekor qilindi.");
                process.exit(0);
            }

            await newFilmsColl.deleteMany({});
            await newEpisodesColl.deleteMany({});
            console.log("✅ Yangi baza tozalandi.");
        }

        if (films.length > 0) {
            await newFilmsColl.insertMany(films);
            console.log(`✅ ${films.length} ta film yangi bazaga o'tkazildi.`);
        }

        if (episodes.length > 0) {
            await newEpisodesColl.insertMany(episodes);
            console.log(`✅ ${episodes.length} ta epizod yangi bazaga o'tkazildi.`);
        }

        console.log("🎉 Migratsiya to'liq muvaffaqiyatli yakunlandi!");
        process.exit(0);
    } catch (e) {
        console.error("❌ Xatolik yuz berdi:", e.message);
        process.exit(1);
    }
}

migrate();
