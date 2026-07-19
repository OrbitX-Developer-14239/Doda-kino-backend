import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { UserModel } from './src/models/user.model.js';
import fs from 'fs';
mongoose.connect(process.env.MONGO_URI).then(async () => {
    const users = await UserModel.find({ telegram_id: { $exists: true } }).limit(2);
    fs.writeFileSync('test_db.json', JSON.stringify(users, null, 2));
    process.exit(0);
});
