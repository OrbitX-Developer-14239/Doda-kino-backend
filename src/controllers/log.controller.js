import { catchAsync } from "../utils/catchAsync.js";
import { LogService } from "../services/log.service.js";

export const LogController = {
    getAllLogs: catchAsync(async (req, res) => {

        const { logs, totalDocs, page, limit } = await LogService.getAllLogs(req.query);

        res.status(200).json({
            success: true,
            message: "Logs fetched successfully",
            data: logs,
            meta: {
                totalDocs,
                page,
                limit,
                totalPages: Math.ceil(totalDocs / limit)
            }
        });
    })
};