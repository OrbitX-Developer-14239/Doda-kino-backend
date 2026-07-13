import { LogModel } from "../models/log.model.js";

export const LogService = {
    async getAllLogs(queryParams) {
        const { time, level, source, page = 1, limit = 50 } = queryParams;

        let filter = {};

        if (time) {
            const parsedTime = parseInt(time.replace('h', ''));
            if (!isNaN(parsedTime)) {
                const sinceDate = new Date(Date.now() - parsedTime * 60 * 60 * 1000);
                filter.timestamp = { $gte: sinceDate };
            }
        }

        if (level) {
            const levels = level.split(',').map(l => l.trim().toLowerCase());
            filter.level = { $in: levels };
        }

        if (source) {
            filter['meta.source'] = source;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const logs = await LogModel.find(filter)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const totalDocs = await LogModel.countDocuments(filter);

        return {
            logs,
            totalDocs,
            page: parseInt(page),
            limit: parseInt(limit)
        };
    }
};