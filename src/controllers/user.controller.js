import { catchAsync } from "../utils/catchAsync.js";
import { UserService } from "../services/user.service.js";

export const userController = {
    createUser: catchAsync(async (req, res) => {
        const body = req.body
        const data = await UserService.createUser(body)
        console.log(req.body, "req.body");

        res.status(201).json({ success: true, data })
    }),

    updateUser: catchAsync(async (req, res) => {
        const body = req.body

        const data = await UserService.updateUser(body)

        res.status(200).json({ success: true, data })
    }),

    getUsers: catchAsync(async (req, res) => {
        const data = await UserService.getUsers()

        res.status(200).json({ success: true, data })
    })
}