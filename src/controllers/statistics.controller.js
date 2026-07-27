import { StatisticsService } from "../services/statistics.service.js";
import { logger } from "../utils/logger.js";

export const StatisticsController = {
    async addView(req, res, next) {
        try {
            const { type, code } = req.body;

            if (!type || !code) {
                return res.status(400).json({ success: false, message: "Type va code majburiy!" });
            }

            await StatisticsService.addView(type, code);

            return res.status(200).json({ success: true, message: "View qo'shildi" });
        } catch (error) {
            logger.error(`[StatisticsController.addView] Error: ${error.message}`);
            next(error);
        }
    },

    async getAll(req, res, next) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 20;

            const result = await StatisticsService.getAll(page, limit);

            return res.status(200).json({
                success: true,
                ...result
            });
        } catch (error) {
            logger.error(`[StatisticsController.getAll] Error: ${error.message}`);
            next(error);
        }
    },

    async getTop(req, res, next) {
        try {
            const topCount = parseInt(req.query.top) || 100;
            const page = parseInt(req.query.page) || 1;
            const limit = 20;

            const result = await StatisticsService.getTop(topCount, page, limit);

            return res.status(200).json({
                success: true,
                ...result
            });
        } catch (error) {
            logger.error(`[StatisticsController.getTop] Error: ${error.message}`);
            next(error);
        }
    }
};
