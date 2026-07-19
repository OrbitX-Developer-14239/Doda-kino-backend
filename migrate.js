import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { UserModel } from './src/models/user.model.js';
mongoose.connect(process.env.MONGO_URI).then(async () => {
    const users = await UserModel.find();
    let count = 0;
    for (const user of users) {
        if (Array.isArray(user.channels_condition) && Array.isArray(user.channels_condition[0])) {
            user.channels_condition = user.channels_condition.flat();
            await UserModel.updateOne({ _id: user._id }, { $set: { channels_condition: user.channels_condition } });
            count++;
        }
    }
    console.log('Migration complete. Fixed', count, 'users');
    process.exit(0);
});
