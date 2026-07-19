import { InstagramService } from "../services/instagram.service.js";
import { catchAsync } from "../utils/catchAsync.js";
import { CONFIG } from "../config/index.js";
import fs from "fs";
import { logger } from "../utils/logger.js";
const instagramService = new InstagramService();

export const InstagramController = {
    getProfile: catchAsync(async (req, res) => {
        const data = await instagramService.getProfile();
        res.status(200).json({ success: true, data });
    }),

    getProfileGrowth: catchAsync(async (req, res) => {
        const data = await instagramService.getProfileInsights();
        res.status(200).json({ success: true, data });
    }),

    getPostStats: catchAsync(async (req, res) => {
        const data = await instagramService.getPostsStatistics();
        res.status(200).json({ success: true, data });
    }),

    getPostById: catchAsync(async (req, res) => {
        const data = await instagramService.getPostById(req.params.id);
        res.status(200).json({ success: true, data });
    }),

    getStories: catchAsync(async (req, res) => {
        const data = await instagramService.getStories();
        res.status(200).json({ success: true, data });
    }),

    uploadStory: catchAsync(async (req, res) => {
        if (!req.file) {
            throw new Error("Media fayl (rasm yoki video) yuborilishi shart");
        }

        const isVideo = req.file.mimetype.startsWith('video/');
        const mediaType = isVideo ? 'VIDEO' : 'IMAGE';

        // CONFIG dan server manzilini olamiz, negaki Meta serverlari internetdagi ochiq URL dan tortishi kerak.
        const fileUrl = `${CONFIG.SERVER_URL || `${req.protocol}://${req.get('host')}`}/public/uploads/${req.file.filename}`;

        try {
            // Instagramga yuborish
            const data = await instagramService.uploadStory(fileUrl, mediaType);

            // Yuklangandan so'ng xira bo'lmasligi yoki server to'lib ketmasligi uchun o'chirib tashlaymiz
            fs.unlink(req.file.path, (err) => {
                if (err) logger.error(`Story faylini o'chirishda xatolik: ${err}`);
            });

            res.status(201).json({ success: true, message: "Hikoya muvaffaqiyatli yuklandi!", data });
        } catch (error) {
            // Xato bo'lsa ham local serverdan faylni o'chiramiz
            fs.unlink(req.file.path, () => { });
            throw error;
        }
    })
};
