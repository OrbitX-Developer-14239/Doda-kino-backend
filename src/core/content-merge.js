import { currentTenant } from "./tenant-context.js";

/**
 * ============================================
 *  Aralash bot uchun kontentni birlashtirib o'qish
 * ============================================
 *
 * "Doda Media" kabi bot o'z film bazasiga ega emas: u bir nechta boshqa
 * botning bazasini birlashtirib ko'rsatadi (kino + multfilm bitta botda).
 *
 * NEGA ALOHIDA MODUL, NEGA SOXTA MODEL EMAS:
 * Mongoose modelining o'rniga proxy qo'yib, `.find().sort().skip().limit()`
 * zanjirini taqlid qilish mumkin edi — lekin bu butun Query quruvchisini
 * qaytadan yozish demak: bitta e'tibordan chetda qolgan metod jimgina
 * noto'g'ri natija berardi. Buning o'rniga o'qish yo'llari (jami 8 ta)
 * shu yerda ochiq-oydin sanab chiqilgan, qolgan hamma joyda esa aralash
 * botning Film/Episode modeli darhol xato tashlaydi (tenant-registry.js).
 *
 * Yozish yo'llari umuman yo'q: aralash bot kontentga hech qachon yozmaydi.
 */

/**
 * Joriy bot aralash bo'lsa — uning kontent do'konlari, aks holda null.
 * Servislar shu qiymat bo'yicha oddiy yo'ldan yoki birlashgan yo'ldan boradi.
 */
export const mergedStores = () => {
    const tenant = currentTenant();
    if (!tenant?.content?.readOnly) return null;
    return tenant.content.stores;
};

/** Har do'kondan bittadan so'rov — natijalar tekis ro'yxatga yig'iladi */
const fromAll = async (stores, fn) => {
    const results = await Promise.all(stores.map(fn));
    return results.flat().filter(Boolean);
};

/** Kod bo'yicha film — qaysi bazada topilsa o'sha */
export const mergedFilmByCode = async (stores, code) => {
    const found = await fromAll(stores, (s) => s.Film.findOne({ code }).lean());
    return found[0] || null;
};

/** Kod bo'yicha qism */
export const mergedEpisodeByCode = async (stores, code) => {
    const found = await fromAll(stores, (s) => s.Episode.findOne({ code }).lean());
    return found[0] || null;
};

/** Kodlar ro’yxati bo’yicha qismlar — bitta filmning taqsimoti uchun */
export const mergedEpisodesByCodes = async (stores, codes) =>
    fromAll(stores, (s) =>
        s.Episode.find({ code: { $in: codes } })
            .select("code views episodeNumber season name")
            .lean()
    );

/** _id bo'yicha film. ObjectId bazalararo takrorlanmaydi. */
export const mergedFilmById = async (stores, id) => {
    const found = await fromAll(stores, (s) => s.Film.findById(id).lean().catch(() => null));
    return found[0] || null;
};

/**
 * Sahifalangan ro'yxat.
 *
 * Bazalar alohida bo'lgani uchun Mongo ularni o'zi tartiblab bera olmaydi.
 * Shuning uchun har bazadan kerakli sahifagacha bo'lgan qism olinadi
 * (skip + limit), keyin xotirada birlashtirilib qayta tartiblanadi va
 * kerakli bo'lak kesib olinadi. Sahifa hajmi 12 ta — yuk sezilarsiz.
 */
export const mergedFilmsPaginated = async (stores, page, limit, select) => {
    const safePage = Math.max(1, Number(page) || 1);
    const need = safePage * limit;

    const [counts, chunks] = await Promise.all([
        Promise.all(stores.map((s) => s.Film.estimatedDocumentCount())),
        Promise.all(
            stores.map((s) =>
                s.Film.find()
                    .select(select)
                    .sort({ createdAt: -1 })
                    .limit(need)
                    .lean()
            )
        ),
    ]);

    const totalFilms = counts.reduce((a, b) => a + b, 0);
    const merged = chunks
        .flat()
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    return {
        films: merged.slice((safePage - 1) * limit, safePage * limit),
        pagination: {
            currentPage: safePage,
            totalPages: Math.ceil(totalFilms / limit),
            totalFilms,
        },
    };
};

/** Nom bo'yicha qidiruv (AI xizmatining zaxira yo'li) */
export const mergedFilmsByPatterns = async (stores, patterns, limit) => {
    const found = await fromAll(stores, (s) =>
        s.Film.find({ $or: [{ name: { $in: patterns } }, { originalName: { $in: patterns } }] })
            .select("name originalName code year")
            .limit(limit)
            .lean()
    );
    return found.slice(0, limit);
};

/**
 * Ko'rishlar hisoblagichi.
 *
 * Bu yagona yozish amali va u kontentni o'zgartirmaydi — faqat `views`
 * ni oshiradi. Kod qaysi bazada bo'lsa, o'sha yerda oshadi; boshqalarida
 * mos hujjat topilmaydi va hech narsa bo'lmaydi.
 */
export const mergedIncViews = async (stores, type, code) => {
    const field = type === "film" ? "Film" : "Episode";
    await Promise.all(
        stores.map((s) => s[field].updateOne({ code: Number(code) }, { $inc: { views: 1 } }))
    );
};

/** Statistika ro'yxati (admin panel) */
export const mergedFilmsWithEpisodes = async (stores, { sort, page, limit }) => {
    const safePage = Math.max(1, Number(page) || 1);
    const need = safePage * limit;

    const [counts, chunks] = await Promise.all([
        Promise.all(stores.map((s) => s.Film.estimatedDocumentCount())),
        Promise.all(
            stores.map((s) =>
                s.Film.find()
                    .sort(sort)
                    .limit(need)
                    .select("name code views episodes")
                    .populate({ path: "episodes.episodeId", select: "name code views" })
                    .lean()
            )
        ),
    ]);

    const [sortField, sortDir] = Object.entries(sort)[0];
    const merged = chunks.flat().sort((a, b) => {
        const av = sortField === "createdAt" ? new Date(a[sortField] || 0) : (a[sortField] || 0);
        const bv = sortField === "createdAt" ? new Date(b[sortField] || 0) : (b[sortField] || 0);
        return sortDir === -1 ? bv - av : av - bv;
    });

    return { films: merged, totalFilms: counts.reduce((a, b) => a + b, 0) };
};
