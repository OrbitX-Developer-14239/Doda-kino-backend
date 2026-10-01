import { InstagramService } from "../services/instagram.service.js";
import { catchAsync } from "../utils/catchAsync.js";
import { CONFIG } from "../config/index.js";
import fs from "fs";
import { logger } from "../utils/logger.js";
const instagramService = new InstagramService();

const MAX_COLLABORATORS = 3; // Instagram chegarasi
const USERNAME_RE = /^[a-z0-9._]{1,30}$/;

/**
 * Hammualliflar: "ali, @vali" yoki ["ali","vali"] — tozalangan username
 * ro'yxati. Noto'g'ri username yoki 3 tadan ko'pi — 400: Instagram
 * baribir rad etardi, lekin fayl yuklangandan keyin, ya'ni behuda kutishdan so'ng.
 */
export function parseCollaborators(raw) {
    if (raw == null || raw === "") return [];
    let list = raw;
    if (typeof raw === "string") {
        try {
            list = raw.trim().startsWith("[") ? JSON.parse(raw) : raw.split(/[\s,]+/);
        } catch {
            list = raw.split(/[\s,]+/);
        }
    }
    if (!Array.isArray(list)) list = [list];

    const names = [...new Set(list.map((n) => String(n).trim().replace(/^@+/, "").toLowerCase()).filter(Boolean))];
    const bad = names.filter((n) => !USERNAME_RE.test(n));
    if (bad.length) {
        throw Object.assign(new Error(`Noto'g'ri Instagram username: ${bad.join(", ")}`), { status: 400 });
    }
    if (names.length > MAX_COLLABORATORS) {
        throw Object.assign(new Error(`Hammualliflar ${MAX_COLLABORATORS} tadan oshmasligi kerak`), { status: 400 });
    }
    return names;
}

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

    deleteMedia: catchAsync(async (req, res) => {
        const data = await instagramService.deleteMedia(req.params.id);
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
            const data = await instagramService.uploadStory(fileUrl, mediaType, req.file.path);

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
    }),

    /** Yangi post: rasm — post, video — Reels. `caption` ixtiyoriy. */
    uploadPost: catchAsync(async (req, res) => {
        if (!req.file) {
            throw Object.assign(new Error("Media fayl (rasm yoki video) yuborilishi shart"), { status: 400 });
        }

        try {
            // Instagram izoh chegarasi — 2200 belgi
            const caption = String(req.body?.caption ?? "").trim().slice(0, 2200);
            const collaborators = parseCollaborators(req.body?.collaborators);
            const mediaType = req.file.mimetype.startsWith('video/') ? 'VIDEO' : 'IMAGE';
            const fileUrl = `${CONFIG.SERVER_URL || `${req.protocol}://${req.get('host')}`}/public/uploads/${req.file.filename}`;

            const data = await instagramService.uploadPost(fileUrl, mediaType, caption, req.file.path, collaborators);
            res.status(201).json({ success: true, message: "Post joylandi!", data: { ...data, collaborators } });
        } finally {
            // Meta faylni tortib bo'ldi (yoki rad etdi) — serverda saqlanmaydi
            fs.unlink(req.file.path, () => { });
        }
    }),

    /** Bizni hammuallif qilib chaqirgan, hali javob berilmagan postlar */
    getCollabInvites: catchAsync(async (req, res) => {
        const data = await instagramService.getCollabInvites();
        res.status(200).json({ success: true, data });
    }),

    /** Taklifni qabul qilish yoki rad etish: body { accept: true | false } */
    respondCollabInvite: catchAsync(async (req, res) => {
        const { accept } = req.body || {};
        if (typeof accept !== "boolean") {
            throw Object.assign(new Error("accept true yoki false bo'lishi kerak"), { status: 400 });
        }
        const data = await instagramService.respondCollabInvite(req.params.mediaId, accept);
        res.status(200).json({ success: true, data });
    }),

    /** Hammuallif yozilayotganda takliflar: ?q=username */
    searchAccounts: catchAsync(async (req, res) => {
        const data = await instagramService.searchAccounts(req.query.q);
        res.status(200).json({ success: true, data });
    }),

    getCollaborators: catchAsync(async (req, res) => {
        const data = await instagramService.getCollaborators(req.params.id);
        res.status(200).json({ success: true, data });
    }),
};
