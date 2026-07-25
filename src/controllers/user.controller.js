import { catchAsync } from "../utils/catchAsync.js";
import { UserService } from "../services/user.service.js";

export const userController = {
    createUser: catchAsync(async (req, res) => {
        const body = req.body
        const data = await UserService.createUser(body)

        res.status(201).json({ success: true, data })
    }),

    updateUser: catchAsync(async (req, res) => {
        const body = req.body

        const data = await UserService.updateUser(body)

        res.status(200).json({ success: true, data })
    }),

    getUsers: catchAsync(async (req, res) => {
        const data = await UserService.getUsers(req.query)

        res.status(200).json({ success: true, data })
    }),

    getUserByTelegramId: catchAsync(async (req, res) => {
        const { telegram_id } = req.params;
        const data = await UserService.getUserByTelegramId(telegram_id);
        
        if (!data) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        
        res.status(200).json({ success: true, data });
    })
}