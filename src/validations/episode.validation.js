import z from "zod";

const editVideoValidation = z.object({
    videoUrl: z.string().url("Noto'g'ri video havolasi"),
    instagram: z.object({
        isPublished: z.boolean().default(false),
        postId: z.string().nullable().optional(),
        mediaType: z.enum(["POST", "REELS"]).default("REELS"),
        caption: z.string().optional()
    }).optional()
});

export const EpisodeValidation = z.object({
    body: z.object({
        filmId: z.string().regex(/^[0-9a-fA-F]{24}$/, "Noto'g'ri Film ID formati (Mongoose ObjectId bo'lishi shart)"),
        code: z.coerce.number().int().min(100, "Kodingiz 100 dan kichik bo'lishi mumkin emas"),
        episodeNumber: z.coerce.number().int().min(1, "Qism tartib raqami 1 dan boshlanishi kerak"),
        name: z.string().trim().min(1, "Qism nomi kamida 1ta harfdan iborat bo'lishi kerak"),
        videoFileId: z.string().min(1, "Video fayl (Telegram Cloud uchun) majburiy"),
        description: z.string().trim().min(10, "Kengroq ta'rif bering").optional().or(z.string().max(0)),
        releaseYear: z.coerce.number().int().min(1800).max(new Date().getFullYear()).optional(),
        country: z.string().trim().min(2).optional(),
        caption: z.string().optional(),
        genres: z.preprocess(val => {
            if (typeof val === 'string') {
                try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed; } catch (e) { }
                return val.split(',').map(s => s.trim());
            }
            return Array.isArray(val) ? val : val ? [val] : [];
        }, z.array(z.string())).optional(),
        editVideos: z.preprocess(val => {
            if (typeof val === 'string') {
                try { return JSON.parse(val); } catch (e) { }
            }
            return val;
        }, z.array(editVideoValidation).max(10, "Maksimal 10 ta edit video yuklash mumkin").optional())
    })
});