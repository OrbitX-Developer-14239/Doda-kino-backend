import { z } from "zod";

export const adminValidation = z.object({
    body: z.object({
        username: z.string().min(3, "Username kamida 3ta harfdan iborat bo'lishi kerak"),
        password: z.string().min(5, "Parol kamida 5ta belgi bo'lishi shart")
    })
});

// Tokenlar ATAYLAB string sifatida tiplanadi — bu {"$ne": null} kabi operator
// inyeksiyasining Mongo filtriga tushishini oldini oladi.
const tokenString = z.string().min(8).max(200);

const contactFields = {
    telegramId: z.union([z.number(), z.string().regex(/^-?\d{1,20}$/)]).optional(),
    telegramUsername: z.string().max(200).optional().nullable(),
    phoneNumber: z.string().max(50).optional().nullable(),
    firstName: z.string().max(200).optional().nullable(),
    lastName: z.string().max(200).optional().nullable(),
    authSessionToken: z.string().max(200).optional().nullable(),
};

export const verifyByBotValidation = z.object({
    body: z.object({
        verifyToken: tokenString,
        ...contactFields,
    })
});

export const verifyByTokenValidation = z.object({
    params: z.object({ token: tokenString })
});

export const telegramAuthValidation = z.object({
    body: z.object({ token: tokenString.optional() }),
});

export const telegramContactValidation = z.object({
    body: z.object({
        loginToken: tokenString.optional(),
        linkToken: tokenString.optional(),
        ...contactFields,
        phone_number: z.string().max(50).optional().nullable(),
        telegram_id: z.union([z.number(), z.string().regex(/^-?\d{1,20}$/)]).optional(),
        user_id: z.union([z.number(), z.string().regex(/^-?\d{1,20}$/)]).optional(),
        username: z.string().max(200).optional().nullable(),
        first_name: z.string().max(200).optional().nullable(),
        last_name: z.string().max(200).optional().nullable(),
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
