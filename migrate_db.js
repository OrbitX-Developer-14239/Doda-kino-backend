import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { UserModel } from './src/models/user.model.js';

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const users = await UserModel.find();
    let count = 0;
    for (const user of users) {
        if (!user.channels_condition) continue;
        let flatArr = [];
        for (const item of user.channels_condition) {
            if (Array.isArray(item)) flatArr.push(...item);
            else flatArr.push(item);
        }

        const unique = [];
        const map = new Set();
        for (const c of flatArr) {
            if (c && c.telegram_id && !map.has(c.telegram_id)) {
                // Ensure boolean has_joined
                if (c.has_joined === undefined) c.has_joined = c.is_member;
                unique.push(c);
                map.add(c.telegram_id);
            }
        }

        await UserModel.updateOne({ _id: user._id }, { $set: { channels_condition: unique } });
        count++;
    }
    console.log('Migration complete. Fixed ' + count + ' users');
    process.exit(0);
});
