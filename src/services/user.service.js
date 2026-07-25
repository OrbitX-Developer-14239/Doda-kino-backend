import { UserModel } from "../models/user.model.js";
import { ChannelModel } from "../models/channels.model.js";

export const UserService = {
    async createUser(body) {
        const updateDoc = { $set: {} };
        for (const [key, value] of Object.entries(body)) {
            if (value !== undefined) {
                updateDoc.$set[key] = value;
            }
        }
        
        const data = await UserModel.findOneAndUpdate(
            { telegram_id: body.telegram_id },
            updateDoc,
            { returnDocument: "after", upsert: true }
        )
        return data
    },

    async updateUser(body) {
        // Avvalgi holatlarini eslab qolish uchun
        const existingUser = await UserModel.findOne({ telegram_id: body.telegram_id });
        let newConditions = body.channels_condition || [];

        // Hozirgi aktiv kanallarni olamiz
        const activeChannels = await ChannelModel.find({}, { telegram_id: 1, name: 1 }).lean();
        const activeIds = new Set();

        const mergedMap = new Map();

        // Barcha aktiv kanallarni default qiymatlar bilan kiritamiz
        activeChannels.forEach(c => {
            activeIds.add(c.telegram_id);
            mergedMap.set(c.telegram_id, {
                telegram_id: c.telegram_id,
                name: c.name,
                is_member: false,
                has_joined: false
            });
        });

        if (existingUser && existingUser.channels_condition) {
            existingUser.channels_condition.forEach(c => {
                // Faqat aktiv kanallarni qoldiramiz va eskilarini ustiga yozamiz
                if (c && c.telegram_id && activeIds.has(c.telegram_id)) {
                    mergedMap.set(c.telegram_id, {
                        ...mergedMap.get(c.telegram_id),
                        ...c
                    });
                }
            });
        }

        if (newConditions.length > 0) {
            newConditions.forEach(newC => {
                if (!activeIds.has(newC.telegram_id)) return;
                
                const oldC = mergedMap.get(newC.telegram_id) || {};
                const hasJoinedItem = newC.is_member || oldC.has_joined || false;

                mergedMap.set(newC.telegram_id, {
                    ...oldC,
                    ...newC,
                    has_joined: hasJoinedItem
                });
            });
        }

        if (body.channels_condition) {
            body.channels_condition = Array.from(mergedMap.values());
        }

        const updateDoc = { $set: {} };
        for (const [key, value] of Object.entries(body)) {
            if (value !== undefined) {
                updateDoc.$set[key] = value;
            }
        }

        const data = await UserModel.findOneAndUpdate(
            { telegram_id: body.telegram_id },
            updateDoc,
            { returnDocument: "after", upsert: true }
        )
        return data
    },

    async getUsers(queryParams) {
        const { page = 1, limit = 50, is_subscribed, channel_id } = queryParams;

        let filter = {};
        let andConditions = [];

        if (channel_id) {
            andConditions.push({
                channels_condition: { $elemMatch: { telegram_id: channel_id, is_member: true } }
            });
        }

        if (is_subscribed === 'true') {
            andConditions.push({
                channels_condition: {
                    $exists: true,
                    $type: 'array',
                    $ne: [],
                    $not: { $elemMatch: { is_member: false } }
                }
            });
        } else if (is_subscribed === 'false') {
            andConditions.push({
                $or: [
                    { channels_condition: { $exists: false } },
                    { channels_condition: { $size: 0 } },
                    { channels_condition: { $elemMatch: { is_member: false } } }
                ]
            });
        }

        if (andConditions.length > 0) {
            filter.$and = andConditions;
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
    },

    async getUserByTelegramId(telegram_id) {
        return await UserModel.findOne({ telegram_id });
    }
}