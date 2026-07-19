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
        // Avvalgi holatlarini eslab qolish uchun
        const existingUser = await UserModel.findOne({ telegram_id: body.telegram_id });
        let newConditions = body.channels_condition || [];

        if (existingUser && existingUser.channels_condition) {
            // Har qanday eski va yangi ma'lumotlarni birlashtirish
            const mergedMap = new Map();
            existingUser.channels_condition.forEach(c => {
                if (c && c.telegram_id) mergedMap.set(c.telegram_id, c);
            });

            newConditions.forEach(newC => {
                const oldC = mergedMap.get(newC.telegram_id) || {};
                const hasJoinedItem = newC.is_member || oldC.has_joined || false;

                mergedMap.set(newC.telegram_id, {
                    ...oldC,
                    ...newC,
                    has_joined: hasJoinedItem
                });
            });
            body.channels_condition = Array.from(mergedMap.values());
        } else if (body.channels_condition) {
            body.channels_condition = body.channels_condition.map(newC => ({
                ...newC,
                has_joined: newC.is_member
            }));
        }

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