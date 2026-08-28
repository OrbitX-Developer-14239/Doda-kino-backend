import z from "zod";

/**
 * AI taklifi uchun: faqat NOM majburiy.
 * Yil va davlat ixtiyoriy — ular bir xil nomli kinolarni ajratishga yordam beradi
 * (masalan bir nechta "Battalion" bor).
 */
export const filmAiSuggestValidation = z.object({
    body: z.object({
        name: z.string().trim().min(1, "Kino nomi majburiy").max(200),
        year: z.coerce.number().int().min(1800).max(new Date().getFullYear()).optional(),
        country: z.string().trim().min(2).max(100).optional(),
        seasonsCount: z.coerce.number().int().min(1).max(100).optional(),
        // Nechta qism uchun bo'sh kod kerakligi
        episodeCount: z.coerce.number().int().min(1).max(200).default(1),
    })
});

export const filmValidation = z.object({
    body: z.object({
        code: z.coerce.number().int().min(50000, "Kodingiz 50000 dan kichik bo'lishi mumkin emas"),
        name: z.string().trim().min(1, "Film nomi kamida 1ta harfdan iborat bo'lishi kerak"),
        originalName: z.string().trim().min(1, "Film original nomi kamida 1ta harfdan iborat bo'lishi kerak"),
        year: z.coerce.number().int().min(1800, "Xato yil").max(new Date().getFullYear(), "Kelajakdagi yil kiritib bo'lmaydi"),
        country: z.string().trim().min(2, "Davlat kiritilishi shart"),
        // Fasllar soni — ixtiyoriy, berilmasa 1 (bir faslli film)
        seasonsCount: z.coerce.number().int().min(1, "Fasllar soni kamida 1 bo'lishi kerak").max(100).optional(),
        genres: z.preprocess(val => {
            if (typeof val === 'string') {
                try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed; } catch (e) { }
                return val.split(',').map(s => s.trim());
            }
            return Array.isArray(val) ? val : val ? [val] : [];
        }, z.array(z.string())).optional(),
        description: z.string().trim().min(10, "Kengroq ta'rif bering"),
        // episodesCount ataylab yo'q: u qo'lda kiritilmaydi, epizod qo'shilgan/o'chirilgan
        // sayin avtomatik hisoblanadi (episode.service.js dagi $inc).
        posterId: z.preprocess(val => {
            if (typeof val === 'string') {
                try { return JSON.parse(val); } catch (e) { return val; }
            }
            return val;
        }, z.object({
            channelId: z.coerce.string().min(1, "channelId majburiy"),
            msgId: z.coerce.number().int().min(1, "msgId majburiy")
        }, { invalid_type_error: "posterId ob'yekt bo'lishi kerak: { channelId, msgId }" }).optional()),
    })
});