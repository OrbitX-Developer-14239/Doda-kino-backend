import { z } from "zod";

export const adminValidation = z.object({
    body: z.object({
        username: z.string().min(3, "Username kamida 3ta harfdan iborat bo'lishi kerak"),
        password: z.string().min(5, "Parol kamida 5ta belgi bo'lishi shart")
    })
});

export const adminUpdateValidation = z.object({
    body: z.object({
        username: z.string().min(3, "Username kamida 3ta harfdan iborat bo'lishi kerak").optional(),
        password: z.string().min(5, "Parol kamida 5ta belgi bo'lishi shart").optional(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        telegramUsername: z.string().optional(),
        phoneNumber: z.string().optional(),
        telegramId: z.union([z.number(), z.string().regex(/^\d+$/)]).optional(),
        role: z.enum(["superadmin", "admin"]).optional(),
        isVerified: z.boolean().optional()
    }).strict()
});
