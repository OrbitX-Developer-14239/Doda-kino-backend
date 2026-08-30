import { BroadcastService } from "../services/broadcast.service.js";
import { catchAsync } from "../utils/catchAsync.js";

export const BroadcastController = {
    /** Tanlash uchun botlar ro'yxati (foydalanuvchi soni bilan) */
    listTargets: catchAsync(async (req, res) => {
        const data = await BroadcastService.listTargets();
        res.status(200).json({ success: true, data });
    }),

    create: catchAsync(async (req, res) => {
        const data = await BroadcastService.create({
            ...req.body,
            // Hisobot o'sha kanalda turgan bot orqali qaytariladi
            reporterBotId: req.bot?.botId ?? null,
        });
        res.status(201).json({
            success: true,
            data: {
                _id: data._id,
                botIds: data.botIds,
                totalRuns: data.totalRuns,
                intervalHours: data.intervalHours,
                status: data.status,
            },
        });
    }),

    list: catchAsync(async (req, res) => {
        const data = await BroadcastService.recent();
        res.status(200).json({ success: true, data });
    }),

    cancel: catchAsync(async (req, res) => {
        const data = await BroadcastService.cancel(req.params.id);
        res.status(200).json({ success: true, data: { _id: data._id, status: data.status } });
    }),
};
