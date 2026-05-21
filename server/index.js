// server/index.js — bootstrap: env, MongoDB, Telegraf, WebSocket, listen

const path = require('path');

require('dotenv').config();
if (!process.env.TELEGRAM_TOKEN) {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const http = require('http');
const { WebSocketServer } = require('ws');
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');

const User = require('./models/User');
const { migrateLegacyTelegramIdentities } = require('./auth/identityService');
const { createApp } = require('./app');

const port = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET;
const WEB_APP_BASE_URL = process.env.WEB_APP_BASE_URL || 'https://tuleneva25.ru';
const miniAppUrl = 'https://t.me/tuleneva25_bot';

if (!BOT_TOKEN) {
    console.error('ERROR: TELEGRAM_TOKEN is not defined in .env file or environment variables.');
    process.exit(1);
}

if (!JWT_SECRET) {
    console.error('ERROR: JWT_SECRET is not defined in .env file or environment variables.');
    process.exit(1);
}

mongoose.connect('mongodb://localhost:27017')
    .then(async () => {
        console.log('MongoDB connection established successfully!');
        try {
            const migrated = await migrateLegacyTelegramIdentities();
            if (migrated > 0) {
                console.log(`Migrated ${migrated} legacy telegram identities`);
            }
        } catch (e) {
            console.error('Identity migration failed:', e);
        }
    })
    .catch((err) => console.error('MongoDB connection failed:', err.message));

const bot = new Telegraf(BOT_TOKEN);

const BOT_START_MESSAGE = 'Мини аппка'.trim();
bot.start((ctx) => ctx.reply(
    BOT_START_MESSAGE,
    Markup.inlineKeyboard([
        [Markup.button.webApp('🕓 Расписание студии', miniAppUrl)],
    ]),
));
bot.launch();

const notifyAdmins = async (message, extra) => {
    try {
        const admins = await User.find({ role: { $in: ['admin', 'super_admin'] } });
        for (const admin of admins) {
            if (!admin.telegram_id) continue;
            try {
                if (extra) {
                    await bot.telegram.sendMessage(admin.telegram_id, message, extra);
                } else {
                    await bot.telegram.sendMessage(admin.telegram_id, message);
                }
            } catch (e) {
                console.error(`Failed to send notification to admin ${admin.telegram_id}:`, e);
            }
        }
    } catch (err) {
        console.error('Failed to fetch admins for notification:', err);
    }
};

const clients = new Set();

const broadcastUpdate = (type, data) => {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    clients.forEach((client) => {
        if (client.readyState === 1) {
            client.send(message);
        }
    });
    console.log(`Broadcast sent: ${type} to ${clients.size} clients`);
};

const app = createApp({
    jwtSecret: JWT_SECRET,
    botToken: BOT_TOKEN,
    miniAppUrl,
    webAppBaseUrl: WEB_APP_BASE_URL,
    notifyAdmins,
    broadcastUpdate,
    bot,
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    clients.add(ws);

    ws.on('close', () => {
        console.log('WebSocket client disconnected');
        clients.delete(ws);
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        clients.delete(ws);
    });
});

server.listen(port, () => {
    console.log(`Server with WebSocket support listening on port ${port}`);
});
