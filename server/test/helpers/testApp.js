const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const { createApp } = require('../../app');
const User = require('../../models/User');

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

const createTestApp = (overrides = {}) => {
    const notifyAdmins = overrides.notifyAdmins ?? (async () => {});
    return createApp({
        jwtSecret: JWT_SECRET,
        botToken: BOT_TOKEN,
        miniAppUrl: 'https://t.me/test_bot',
        webAppBaseUrl: 'https://test.example',
        notifyAdmins,
        broadcastUpdate: () => {},
        bot: null,
        ...overrides,
    });
};

const seedUser = async (fields = {}) => {
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

module.exports = {
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
