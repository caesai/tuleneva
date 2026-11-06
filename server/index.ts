/**
 * Bootstrap сервера: env, MongoDB, Telegraf, WebSocket, listen.
 * Запасной `.env` ищется рядом с исходником или бандлом (`server/.env` у dist,
 * корень репозитория у `tsx`), а не от текущей папки процесса.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import User from './models/User';
import {
    ensureUniqueIdentityIndex,
    migrateLegacyTelegramIdentities,
} from './auth/identityService';
import { createApp } from './app';
import {
    createNotifyAdmins,
    sendTelegramMessage,
    DEFAULT_TIMEOUT_MS,
} from './notifications/telegramNotify';
import {
    createBot,
    startBotTransport,
    stopBotSafely,
} from './telegram/createBot';
import { createBroadcast } from './realtime/createBroadcast';
import { createObjectStorageFromEnv } from './storage/createObjectStorage';

const serverDir = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();
if (!process.env.TELEGRAM_TOKEN) {
    dotenv.config({ path: path.resolve(serverDir, '../.env') });
}

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
/**
 * Id группы студии (для форума — id супергруппы, не thread). Можно несколько через запятую.
 * Только допуск команд бота. Уведомления о бронях и отменах сюда не шлём — они идут админам в личку.
 */
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
        // Миграцию не запускаем, если уникальный индекс не встал: иначе пакет
        // допишет те же пары identity второму документу.
        let identityIndexReady = false;
        try {
            await ensureUniqueIdentityIndex();
            identityIndexReady = true;
        } catch (e) {
            console.error('Unique identity index failed:', e);
        }
        if (identityIndexReady) {
            try {
                const migrated = await migrateLegacyTelegramIdentities();
                if (migrated > 0) {
                    console.log(`Migrated ${migrated} legacy telegram identities`);
                }
            } catch (e) {
                console.error('Identity migration failed:', e);
            }
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
 * Уведомляет админов в личный чат (параллельно, с таймаутом).
 * Общий чат студии эти сообщения не получает: там бот отвечает только на команды.
 * @param {string} message
 * @param {object} [extra]
 * @returns {Promise<void>}
 */
const notifyAdmins = createNotifyAdmins({
    bot,
    User,
    timeoutMs: TELEGRAM_NOTIFY_TIMEOUT_MS,
});

/**
 * Отправляет сообщение пользователю с таймаутом из env.
 * @param {string|number} chatId
 * @param {string} text
 * @param {object} [extra]
 * @returns {Promise<unknown>}
 */
const notifyUser = (chatId: string | number, text: string, extra?: object): Promise<unknown> =>
    sendTelegramMessage(bot, chatId, text, extra, TELEGRAM_NOTIFY_TIMEOUT_MS);

const { publish, attach } = createBroadcast();

const objectStorage = createObjectStorageFromEnv();
if (!objectStorage) {
    console.warn(
        'Object storage is not configured. Music upload and media responses return 503 until OBJECT_STORAGE_DRIVER is set.',
    );
}

const app = createApp({
    jwtSecret: JWT_SECRET,
    botToken: BOT_TOKEN,
    miniAppUrl,
    webAppBaseUrl: WEB_APP_BASE_URL,
    notifyAdmins,
    notifyUser,
    broadcastUpdate: publish,
    telegramBot: TELEGRAM_WEBHOOK_SECRET ? bot : null,
    telegramWebhookSecret: TELEGRAM_WEBHOOK_SECRET,
    objectStorage,
});

const server = http.createServer(app);
const stopRealtime = attach(server);

let shuttingDown = false;

/**
 * Закрывает HTTP, WebSocket, Mongo и бота по сигналу systemd.
 * @param {string} signal
 */
const gracefulShutdown = (signal: string) => {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;
    console.log(`Shutting down on ${signal}...`);

    const forceTimer = setTimeout(() => {
        console.error('Graceful shutdown timed out, exiting');
        process.exit(1);
    }, 10000);
    forceTimer.unref?.();

    // Снимаем heartbeat и закрываем /ws до server.close — иначе открытые
    // сокеты держат HTTP и колбэк close может не наступить до force-exit.
    stopRealtime();

    server.close(async () => {
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
