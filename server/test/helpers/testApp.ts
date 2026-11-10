import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import User from '../../models/User';

const JWT_SECRET = 'test-secret';
const BOT_TOKEN = 'test-bot-token';

let mongoServer;

const connectTestDb = async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
};

const disconnectTestDb = async () => {
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
};

const clearTestDb = async () => {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
};

const createTestApp = (overrides: any = {}) => {
    const notifyAdmins = overrides.notifyAdmins ?? (async () => {});
    const notifyUser = overrides.notifyUser ?? (async () => {});
    return createApp({
        jwtSecret: JWT_SECRET,
        botToken: BOT_TOKEN,
        miniAppUrl: 'https://t.me/test_bot',
        webAppBaseUrl: 'https://test.example',
        notifyAdmins,
        notifyUser,
        broadcastUpdate: () => {},
        stealthMode: false,
        ...overrides,
    });
};

const seedUser = async (fields: any = {}) => {
    const user = new User({
        first_name: 'Test',
        last_name: null,
        username: 'testuser',
        role: 'guest',
        ...fields,
    });
    await user.save();
    return user;
};

const signJwt = (user) => {
    return jwt.sign(
        { userId: user._id, role: user.role },
        JWT_SECRET,
        { expiresIn: '1d' },
    );
};

const authHeader = (user) => ({
    Authorization: `Bearer ${signJwt(user)}`,
});

export {
    JWT_SECRET,
    BOT_TOKEN,
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    createTestApp,
    seedUser,
    signJwt,
    authHeader,
};
