import { z } from "zod";

// telegram_id ATAYLAB string sifatida tiplanadi: shu orqali {"$ne": null} kabi
// NoSQL operator inyeksiyasi so'rov filtriga tusha olmaydi.
const telegramId = z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => /^-?\d{1,20}$/.test(v), "telegram_id faqat raqamlardan iborat bo'lishi kerak");

const channelCondition = z.object({
    telegram_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
    name: z.string().optional(),
    is_member: z.boolean().optional(),
    has_joined: z.boolean().optional(),
}).strip();

export const createUserValidation = z.object({
    body: z.object({
        telegram_id: telegramId,
        first_name: z.string().max(200).optional(),
        username: z.string().max(200).optional(),
        channels_condition: z.array(channelCondition).max(100).optional(),
    }).strip(),
});

export const updateUserValidation = createUserValidation;

export const getUserByTelegramIdValidation = z.object({
    params: z.object({
        telegram_id: telegramId,
    }),
});

export const listUsersValidation = z.object({
    query: z.object({
        // Rad etish o'rniga cheklaymiz: eski mijozlar buzilmasin, lekin
        // `?limit=999999` bilan butun kolleksiyani so'rab bo'lmasin.
        page: z.coerce.number().int().catch(1).transform((v) => Math.max(v, 1)),
        limit: z.coerce.number().int().catch(50).transform((v) => Math.min(Math.max(v, 1), 200)),
        is_subscribed: z.enum(["true", "false"]).optional(),
        channel_id: z.string().max(64).optional(),
    }).strip(),
});
