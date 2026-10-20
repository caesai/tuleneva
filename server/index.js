// server/index.js — bootstrap: env, MongoDB, Telegraf, WebSocket, listen

const path = require('path');

require('dotenv').config();
if (!process.env.TELEGRAM_TOKEN) {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

const http = require('http');
const { WebSocketServer } = require('ws');
const mongoose = require('mongoose');

const User = require('./models/User');
const { migrateLegacyTelegramIdentities } = require('./auth/identityService');
const { createApp } = require('./app');
const {
    createNotifyAdmins,
    sendTelegramMessage,
    DEFAULT_TIMEOUT_MS,
} = require('./notifications/telegramNotify');
const {
    createBot,
    startBotTransport,
    stopBotSafely,
} = require('./telegram/createBot');

const port = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET;
const WEB_APP_BASE_URL = process.env.WEB_APP_BASE_URL || 'https://tuleneva25.ru';
/**
 * Корень Bot API. Обязателен завершающий `/`: Telegraf делает
 * `new URL('./bot…/method', apiRoot)` — без слэша последний сегмент пути
 * (секретный PREFIX воркера) выкидывается → Worker отвечает 404 Not found.
 * trim + снятие кавычек: systemd/редакторы иногда оставляют \\r или ".
 */
const TELEGRAM_API_ROOT = (() => {
    let raw = String(process.env.TELEGRAM_API_ROOT || 'https://api.telegram.org')
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .replace(/[\r\n]+/g, '');
    if (!raw.endsWith('/')) {
        raw = `${raw}/`;
    }
    return raw;
})();
console.log('Telegram API root:', TELEGRAM_API_ROOT);
const TELEGRAM_NOTIFY_TIMEOUT_MS = Number(process.env.TELEGRAM_NOTIFY_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || null;
/** Id группы студии (для форума — id супергруппы, не thread). Можно несколько через запятую. */
const STUDIO_CHAT_ID = (() => {
    const raw = process.env.STUDIO_CHAT_ID;
    if (raw == null || String(raw).trim() === '') {
        return null;
    }
    return String(raw).trim().replace(/^['"]|['"]$/g, '');
})();
if (STUDIO_CHAT_ID) {
    console.log('Studio chat id(s):', STUDIO_CHAT_ID);
}
/**
 * Куда Telegram шлёт апдейты.
 * При кастомном TELEGRAM_API_ROOT (прокси) никогда не ставим webhook на сам VPS —
 * Telegram до Yandex часто получает Connection timed out.
 */
const TELEGRAM_WEBHOOK_URL = (() => {
    if (process.env.TELEGRAM_WEBHOOK_URL) {
        return String(process.env.TELEGRAM_WEBHOOK_URL).trim().replace(/\/$/, '');
    }
    const root = TELEGRAM_API_ROOT.replace(/\/$/, '');
    const isDefaultTelegram = /^https:\/\/api\.telegram\.org\/?$/i.test(root);
    if (!isDefaultTelegram) {
        return `${root}/hook`;
    }
    return null;
})();
const miniAppUrl = 'https://t.me/tuleneva25_bot';

if (TELEGRAM_WEBHOOK_SECRET) {
    console.log(
        'Telegram webhook URL:',
        TELEGRAM_WEBHOOK_URL
            || `${WEB_APP_BASE_URL.replace(/\/$/, '')}/api/telegram/webhook`,
    );
}

if (!BOT_TOKEN) {
    console.error('ERROR: TELEGRAM_TOKEN is not defined in .env file or environment variables.');
    process.exit(1);
}

if (!JWT_SECRET) {
    console.error('ERROR: JWT_SECRET is not defined in .env file or environment variables.');
    process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/test';

mongoose.connect(MONGO_URI)
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

const bot = createBot({
    botToken: BOT_TOKEN,
    apiRoot: TELEGRAM_API_ROOT,
    webAppBaseUrl: WEB_APP_BASE_URL,
    studioChatId: STUDIO_CHAT_ID,
});

/**
 * Уведомляет админов через Telegram (параллельно, с таймаутом).
 * @param {string} message
 * @param {object} [extra]
 * @returns {Promise<void>}
 */
const notifyAdminsBase = createNotifyAdmins({
    bot,
    User,
    timeoutMs: TELEGRAM_NOTIFY_TIMEOUT_MS,
});

/**
 * Админы в личку + опционально чат студии.
 * @param {string} message
 * @param {object} [extra]
 * @returns {Promise<void>}
 */
const notifyAdmins = async (message, extra) => {
    await notifyAdminsBase(message, extra);
    if (STUDIO_CHAT_ID) {
        try {
            await sendTelegramMessage(
                bot,
                STUDIO_CHAT_ID,
                message,
                extra,
                TELEGRAM_NOTIFY_TIMEOUT_MS,
            );
        } catch (err) {
            console.error(
                'Failed to notify studio chat:',
                err && err.message ? err.message : err,
            );
        }
    }
};

/**
 * Отправляет сообщение пользователю с таймаутом из env.
 * @param {string|number} chatId
 * @param {string} text
 * @param {object} [extra]
 * @returns {Promise<unknown>}
 */
const notifyUser = (chatId, text, extra) =>
    sendTelegramMessage(bot, chatId, text, extra, TELEGRAM_NOTIFY_TIMEOUT_MS);

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
    notifyUser,
    broadcastUpdate,
    telegramBot: TELEGRAM_WEBHOOK_SECRET ? bot : null,
    telegramWebhookSecret: TELEGRAM_WEBHOOK_SECRET,
});

const server = http.createServer(app);
const wss = new WebSocketServer({
    server,
    path: '/ws',
    // Safari/WebKit за Nginx рвёт сокет с «network connection was lost», если включено сжатие кадров.
    perMessageDeflate: false,
});

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

// Иначе Nginx закрывает молчащее соединение по proxy_read_timeout (по умолчанию 60 с).
const wsHeartbeat = setInterval(() => {
    clients.forEach((ws) => {
        if (ws.readyState === 1) {
            ws.ping();
        }
    });
}, 25000);
wsHeartbeat.unref?.();

let shuttingDown = false;

/**
 * Закрывает HTTP, WebSocket, Mongo и бота по сигналу systemd.
 * @param {string} signal
 */
const gracefulShutdown = (signal) => {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    console.log(`Shutting down on ${signal}...`);
    clearInterval(wsHeartbeat);

    const forceTimer = setTimeout(() => {
        console.error('Graceful shutdown timed out, exiting');
        process.exit(1);
    }, 10000);
    forceTimer.unref?.();

    server.close(async () => {
        try {
            wss.clients.forEach((ws) => {
                try {
                    ws.close();
                } catch {
                    // ignore
                }
            });
            wss.close();
        } catch (err) {
            console.warn('WebSocket close:', err?.message || err);
        }

        stopBotSafely(bot, signal);

        try {
            await mongoose.connection.close();
            console.log('MongoDB connection closed');
        } catch (err) {
            console.error('MongoDB close failed:', err?.message || err);
        }

        clearTimeout(forceTimer);
        process.exit(0);
    });
};

process.once('SIGINT', () => gracefulShutdown('SIGINT'));
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));

server.listen(port, () => {
    console.log(`Server with WebSocket support listening on port ${port}`);
    startBotTransport({
        bot,
        webhookSecret: TELEGRAM_WEBHOOK_SECRET,
        webAppBaseUrl: WEB_APP_BASE_URL,
        webhookUrl: TELEGRAM_WEBHOOK_URL,
    }).catch((err) => {
        console.error('Bot transport start failed:', err?.message || err);
    });
});
