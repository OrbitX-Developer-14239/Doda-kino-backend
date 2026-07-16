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

    async getUsers(queryParams) {
        const { page = 1, limit = 50, is_subscribed } = queryParams;

        let filter = {};

        if (is_subscribed === 'true') {
            filter.channels_condition = { $exists: true, $not: { $size: 0 } };
        } else if (is_subscribed === 'false') {
            filter.$or = [
                { channels_condition: { $exists: false } },
                { channels_condition: { $size: 0 } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const users = await UserModel.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const totalDocs = await UserModel.countDocuments(filter);

        return {
            users,
            totalDocs,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(totalDocs / parseInt(limit))
        };
    }
}