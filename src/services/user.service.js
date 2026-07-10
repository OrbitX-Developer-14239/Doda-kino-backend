import { UserModel } from "../models/user.model.js";

export const UserService = {
    async createUser(body) {
        const data = await UserModel.findOneAndUpdate(
            { telegram_id: body.telegram_id },
            { $set: body },
            { returnDocument: "after", upsert: true }
        )
        return data
    },

    async updateUser(body) {
        const data = await UserModel.findOneAndUpdate(
            { telegram_id: body.telegram_id },
            { $set: body },
            { returnDocument: "after", upsert: true }
        )
        return data
    },

    async getUsers() {
        const users = await UserModel.find()

        return users
    }
}