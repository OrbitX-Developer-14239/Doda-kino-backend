import { LogModel } from "../models/log.model.js";

export const LogService = {
    async getAllLogs(queryParams) {
        const { time, level, source, page = 1, limit = 50 } = queryParams;

        let filter = {};

        if (time) {
            // Express bir xil parametr ikki marta kelsa massiv qaytaradi —
            // String() ga o'tkazilmasa .replace TypeError bilan 500 berardi.
            const parsedTime = parseInt(String(time).replace('h', ''));
            if (!isNaN(parsedTime)) {
                const sinceDate = new Date(Date.now() - parsedTime * 60 * 60 * 1000);
                filter.timestamp = { $gte: sinceDate };
            }
        }

        if (level) {
            const levels = String(level).split(',').map(l => l.trim().toLowerCase()).filter(Boolean);
            if (levels.length) filter.level = { $in: levels };
        }

        if (source) {
            filter['meta.source'] = String(source);
        }

        const safeLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
        const safePage = Math.max(parseInt(page) || 1, 1);
        const skip = (safePage - 1) * safeLimit;

        const [logs, totalDocs] = await Promise.all([
            LogModel.find(filter)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(safeLimit)
                .lean(),
            LogModel.countDocuments(filter)
        ]);

        return {
            logs,
            totalDocs,
            page: safePage,
            limit: safeLimit
        };
    }
};