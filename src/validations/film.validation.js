import z from "zod";

export const filmValidation = z.object({
    body: z.object({
        code: z.number().int().min(50000, "Kodingiz 50000 dan kichik bo'lishi mumkin emas"),
        name: z.string().trim().min(1, "Film nomi kamida 1ta harfdan iborat bo'lishi kerak"),
        year: z.number().int().min(1800, "Xato yil").max(new Date().getFullYear(), "Kelajakdagi yil kiritib bo'lmaydi"),
        country: z.string().trim().min(2, "Davlat kiritilishi shart"),
        genres: z.array(z.string()).min(1, "Kamida 1 ta janr tanlang"),
        description: z.string().trim().min(10, "Kengroq ta'rif bering"),
        posterId: z.string().min(1, "Poster yuklanishi shart"),
        episodesCount: z.number().int().min(1, "Kamida 1 qism bo'lishi kerak"),
    })
});