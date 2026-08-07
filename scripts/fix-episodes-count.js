import "dotenv/config";
import { connectDB, conn1, conn2 } from "../src/config/db.js";
import { FilmModel } from "../src/models/film.model.js";
import { EpisodeModel } from "../src/models/episode.model.js";

/**
 * `episodesCount` ilgari ham qo'lda kiritilar, ham epizod qo'shilganda avtomatik
 * oshirilar edi — shu sababli eski filmlarda bu son haqiqiy epizodlar sonidan
 * katta bo'lib qolgan. Skript uni haqiqiy songa tenglashtiradi.
 *
 * Ishlatilishi:
 *   npm run fix-episodes-count           -> faqat hisobot (bazaga tegmaydi)
 *   npm run fix-episodes-count -- --apply -> topilgan farqlarni to'g'rilaydi
 */
const APPLY = process.argv.includes("--apply");

const run = async () => {
    await connectDB();

    const films = await FilmModel.find().select("code name episodesCount episodes").lean();

    // Haqiqiy manba — epizodlar kolleksiyasi. Filmdagi `episodes` massivi esa
    // botdagi tugmalarni chizadi; ikkalasi farq qilsa buni alohida ko'rsatamiz.
    const realCounts = await EpisodeModel.aggregate([
        { $group: { _id: "$filmId", count: { $sum: 1 } } }
    ]);
    const realByFilmId = new Map(realCounts.map((r) => [String(r._id), r.count]));

    const wrong = [];
    const diverged = [];

    for (const film of films) {
        const real = realByFilmId.get(String(film._id)) || 0;
        const embedded = film.episodes?.length || 0;

        if (real !== embedded) diverged.push({ film, real, embedded });
        if (film.episodesCount !== real) wrong.push({ film, real });
    }

    console.log(`\nJami film: ${films.length}`);
    console.log(`episodesCount noto'g'ri: ${wrong.length} ta`);

    for (const { film, real } of wrong.slice(0, 30)) {
        console.log(`  code ${film.code} — "${film.name}": ${film.episodesCount} -> ${real}`);
    }
    if (wrong.length > 30) console.log(`  ... va yana ${wrong.length - 30} ta`);

    if (diverged.length) {
        console.log(`\n⚠️  Filmdagi episodes massivi epizodlar kolleksiyasiga mos kelmadi: ${diverged.length} ta`);
        for (const { film, real, embedded } of diverged.slice(0, 10)) {
            console.log(`  code ${film.code} — massivda ${embedded} ta, bazada ${real} ta`);
        }
        console.log("  (bu alohida muammo, skript uni tuzatmaydi)");
    }

    if (!APPLY) {
        console.log("\nHech narsa o'zgartirilmadi. To'g'rilash uchun: npm run fix-episodes-count -- --apply");
    } else if (wrong.length) {
        const result = await FilmModel.bulkWrite(
            wrong.map(({ film, real }) => ({
                updateOne: { filter: { _id: film._id }, update: { $set: { episodesCount: real } } }
            }))
        );
        console.log(`\n✅ To'g'rilandi: ${result.modifiedCount} ta film`);
    } else {
        console.log("\n✅ To'g'rilash shart emas — hammasi joyida.");
    }

    await Promise.all([conn1.close(), conn2.close()]);
    process.exit(0);
};

run().catch((error) => {
    console.error("❌ Xatolik:", error.message);
    process.exit(1);
});
