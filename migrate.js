import mongoose from "mongoose";

const OLD_URI = "mongodb+srv://mirvohidmirzohidov25_db_user:JyEd09tujVB36wBy@cluster0.chyl8s3.mongodb.net/asil_kino?appName=Cluster0";
const NEW_URI = "mongodb+srv://orbitx:9NavwsJIPLqcQLjx@dodakino1.u3bazp5.mongodb.net/dodakino?appName=Dodakino1";

async function migrate() {
    try {
        console.log("🔄 Eski bazaga ulanilmoqda...");
        const oldConn = await mongoose.createConnection(OLD_URI).asPromise();
        console.log("✅ Eski bazaga ulandi.");

        console.log("🔄 Yangi bazaga (MONGO_URI1) ulanilmoqda...");
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
            console.log("⚠️ Yangi bazada ma'lumotlar mavjud, avval tozalash amalga oshirilmoqda...");
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
        console.error("❌ Xatolik yuz berdi:", e);
        process.exit(1);
    }
}

migrate();
