import z from "zod";

export const filmValidation = z.object({
    body: z.object({
        code: z.coerce.number().int().min(50000, "Kodingiz 50000 dan kichik bo'lishi mumkin emas"),
        name: z.string().trim().min(1, "Film nomi kamida 1ta harfdan iborat bo'lishi kerak"),
        originalName: z.string().trim().min(1, "Film original nomi kamida 1ta harfdan iborat bo'lishi kerak"),
        year: z.coerce.number().int().min(1800, "Xato yil").max(new Date().getFullYear(), "Kelajakdagi yil kiritib bo'lmaydi"),
        country: z.string().trim().min(2, "Davlat kiritilishi shart"),
        genres: z.preprocess(val => {
            if (typeof val === 'string') {
                try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed; } catch (e) { }
                return val.split(',').map(s => s.trim());
            }
            return Array.isArray(val) ? val : val ? [val] : [];
        }, z.array(z.string())).optional(),
        description: z.string().trim().min(10, "Kengroq ta'rif bering"),
        episodesCount: z.coerce.number().int().min(1, "Kamida 1 qism bo'lishi kerak"),
    })
});