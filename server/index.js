// server/index.js

/**
 * @file index.js
 * @description Основной файл сервера Express приложения.
 * Содержит настройку сервера, подключение к MongoDB, инициализацию Telegram бота,
 * middleware для аутентификации и API эндпоинты.
 */

const path = require('path');

// Загрузка переменных окружения ДО использования любых env переменных
require("dotenv").config();

// Если переменные не загрузились (например, при запуске из dist/), пробуем найти .env на уровень выше
if (!process.env.TELEGRAM_TOKEN) {
    require("dotenv").config({ path: path.resolve(__dirname, '../.env') });
}

const express = require('express')
const app = express();
const http = require('http');
const { WebSocketServer } = require('ws');
const cors = require('cors');
const port = process.env.PORT || 3000;
const { Telegraf, Markup } = require('telegraf');
const { message } = require('telegraf/filters');
const moment = require('moment');
const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Create HTTP server from Express app
const server = http.createServer(app);

// Create WebSocket server with specific path to avoid conflicts with Vite HMR
const wss = new WebSocketServer({ server, path: '/ws' });

/**
 * Множество подключенных WebSocket клиентов.
 * @type {Set<WebSocket>}
 */
const clients = new Set();

/**
 * Обработка WebSocket соединений.
 */
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

/**
 * Отправляет сообщение всем подключенным WebSocket клиентам.
 * @param {string} type - Тип события ('booking_update', 'booking_cancel').
 * @param {Object} data - Данные для отправки.
 */
const broadcastUpdate = (type, data) => {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(message);
        }
    });
    console.log(`Broadcast sent: ${type} to ${clients.size} clients`);
};

const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET; // Ensure this is loaded

if (!BOT_TOKEN) {
    console.error('ERROR: TELEGRAM_TOKEN is not defined in .env file or environment variables.');
    process.exit(1);
}

// Import the User model
const User = require('./models/User');
const Rehearsal = require('./models/Rehearsal');
const InviteCode = require('./models/InviteCode');
const { INVITE_CODE_TTL_SECONDS } = require('./models/InviteCode');

/**
 * Проверяет, является ли строка временем в формате HH:MM
 * @param {string} str - Строка для проверки
 * @returns {boolean}
 */
const isTimeKey = (str) => /^\d{1,2}:\d{2}$/.test(str);

/**
 * Вычисляет конечное время (начальный час + 1)
 * Например: "23:00" -> "00:00", "12:00" -> "13:00"
 * @param {string} hour - Час в формате "HH:00"
 * @returns {string}
 */
const calculateEndTime = (hour) => {
    const hourNum = parseInt(hour.split(':')[0], 10);
    const nextHour = (hourNum + 1) % 24;
    return `${nextHour.toString().padStart(2, '0')}:00`;
};

/**
 * Извлекает числовое значение часа из строки "HH:00"
 * @param {string} hour - Час в формате "HH:00"
 * @returns {number}
 */
const getHourNumber = (hour) => {
    return parseInt(hour.split(':')[0], 10);
};

/**
 * Объединяет последовательные часы в диапазоны
 * Например: ["14:00", "15:00", "16:00", "19:00"] -> "14:00 - 17:00, 19:00 - 20:00"
 * @param {string[]} hours - Массив часов
 * @returns {string}
 */
const formatHoursRange = (hours) => {
    if (!hours || hours.length === 0) return '';

    const sortedHours = [...hours].sort((a, b) => getHourNumber(a) - getHourNumber(b));
    const ranges = [];

    let rangeStart = sortedHours[0];
    let rangeEnd = sortedHours[0];

    for (let i = 1; i < sortedHours.length; i++) {
        const current = sortedHours[i];
        const prevHourNum = getHourNumber(rangeEnd);
        const currentHourNum = getHourNumber(current);

        if (currentHourNum === prevHourNum + 1) {
            // Последовательный слот - расширяем диапазон
            rangeEnd = current;
        } else {
            // Не последовательный - сохраняем текущий диапазон и начинаем новый
            ranges.push(`${rangeStart} - ${calculateEndTime(rangeEnd)}`);
            rangeStart = current;
            rangeEnd = current;
        }
    }

    // Добавляем последний диапазон
    ranges.push(`${rangeStart} - ${calculateEndTime(rangeEnd)}`);

    return ranges.join(', ');
};

/**
 * Преобразует старый формат бронирований (объект с ключами-часами) в новый формат (массив bookedHourSchema).
 * Старый формат: { "12:00": { status, owner, userId, bandName, avatar, ... }, ... }
 * Новый формат: [{ hour, userId, username, band_name, userPhotoUrl }, ...]
 * 
 * @param {Object|Array} hoursData - Данные из БД (может быть старый формат или новый)
 * @returns {Array} Массив в новом формате bookedHourSchema
 */
const normalizeHoursData = (hoursData) => {
    // Если данных нет, возвращаем пустой массив
    if (!hoursData) {
        return [];
    }

    // Если это уже массив
    if (Array.isArray(hoursData)) {
        // Пустой массив - возвращаем как есть
        if (hoursData.length === 0) {
            return [];
        }

        // Проверяем первый элемент
        const firstItem = hoursData[0];

        // Если первый элемент — это объект и у него есть поле hour, значит новый формат
        if (firstItem && typeof firstItem === 'object' && firstItem.hour) {
            return hoursData;
        }

        // Проверяем, является ли это массивом со старым форматом внутри
        // (hours: [{ "12:00": {...}, "13:00": {...} }])
        if (firstItem && typeof firstItem === 'object') {
            // Конвертируем в plain object (на случай Mongoose document)
            const plainObj = firstItem.toObject ? firstItem.toObject() : firstItem;
            const keys = Object.keys(plainObj);

            // Если хотя бы один ключ выглядит как время (HH:MM), это старый формат
            if (keys.some(isTimeKey)) {
                return convertOldFormatToNew(plainObj);
            }
        }

        // Иначе возвращаем как есть (возможно пустой или неизвестный формат)
        return hoursData;
    }

    // Старый формат: объект, где ключи — это часы
    if (typeof hoursData === 'object') {
        const plainObj = hoursData.toObject ? hoursData.toObject() : hoursData;
        return convertOldFormatToNew(plainObj);
    }

    return [];
};

/**
 * Конвертирует объект старого формата в массив нового формата
 * @param {Object} oldFormatObj - Объект старого формата { "12:00": {...}, ... }
 * @returns {Array} Массив нового формата
 */
const convertOldFormatToNew = (oldFormatObj) => {
    const normalizedHours = [];

    for (const [hour, slotData] of Object.entries(oldFormatObj)) {
        // Пропускаем не-временные ключи (например, _id, __v и т.д.)
        if (!isTimeKey(hour)) {
            continue;
        }

        // Пропускаем незабронированные слоты
        if (!slotData || slotData.status !== 'BOOKED') {
            continue;
        }

        normalizedHours.push({
            hour: hour,
            userId: slotData.userId ? String(slotData.userId) : null,
            username: slotData.owner || '',
            band_name: slotData.bandName || '',
            userPhotoUrl: slotData.avatar || null
        });
    }

    // Сортируем по времени
    normalizedHours.sort((a, b) => a.hour.localeCompare(b.hour));

    return normalizedHours;
};

/**
 * Подключение к базе данных MongoDB.
 */
mongoose.connect("mongodb://localhost:27017")
    .then(() => console.log('MongoDB connection established successfully!'))
    .catch(err => console.error('MongoDB connection failed:', err.message));
const bot = new Telegraf(BOT_TOKEN);

// ... (bot logic)
/**
 * Сообщение, отправляемое ботом при команде /start.
 * @constant {string}
 */
// Define the keyboard markup
const startButtonReply = Markup.keyboard([
    // button text, which is sent as a message to the bot
    ['/start']
]).resize();
const BOT_START_MESSAGE = `Мини аппка`.trim();
const miniAppUrl = 'https://t.me/tuleneva25_bot';
bot.start((ctx) => ctx.reply(BOT_START_MESSAGE,
    Markup.inlineKeyboard([
        [Markup.button.webApp('🕓 Расписание студии', miniAppUrl)]
    ])));
bot.launch();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://127.0.0.1:443'); // Replace with your frontend's origin
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

/**
 * Middleware для аутентификации JWT токена.
 * Проверяет заголовок Authorization, верифицирует токен и добавляет информацию о пользователе в req.user.
 * 
 * @param {import('express').Request} req - Объект запроса Express.
 * @param {import('express').Response} res - Объект ответа Express.
 * @param {import('express').NextFunction} next - Функция передачи управления следующему middleware.
 * @returns {void}
 */
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

    if (token == null) return res.sendStatus(401); // No token

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Invalid token
        req.user = user; // Attach user info (userId, role) to request
        next();
    });
};

/**
 * Middleware для проверки существования пользователя в БД.
 * Проверяет, что пользователь из токена существует в базе данных,
 * и добавляет актуальные данные пользователя в req.dbUser.
 * 
 * @param {import('express').Request} req - Объект запроса Express.
 * @param {import('express').Response} res - Объект ответа Express.
 * @param {import('express').NextFunction} next - Функция передачи управления следующему middleware.
 * @returns {void}
 */
const verifyUserExists = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        req.dbUser = user; // Актуальные данные из БД
        next();
    } catch (err) {
        console.error('Error verifying user existence:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
};

/**
 * Отправляет уведомление всем пользователям с ролью admin или super_admin через Telegram бота.
 * @param {string} message - Текст сообщения.
 * @param {Object} [extra] - Дополнительные параметры для sendMessage (например, Markup).
 */
const notifyAdmins = async (message, extra) => {
    try {
        const admins = await User.find({ role: { $in: ['admin', 'super_admin'] } });
        for (const admin of admins) {
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

app.get('/', (req, res) => {
    res.send('Hello World!');
});

// ... (helper functions parseQueryToNestedJson, verifyTelegramInitData)
/**
 * Парсит строку запроса в объект JSON с поддержкой вложенных JSON объектов.
 * Используется для обработки данных инициализации Telegram.
 * 
 * @param {string} queryString - Строка запроса.
 * @returns {Object} Распаршенный объект.
 */
const parseQueryToNestedJson = (queryString) => {
    const params = new URLSearchParams(queryString);
    const result = {};

    params.forEach((encodedValue, key) => {
        const value = decodeURIComponent(encodedValue);
        if (key === 'user') {
            try {
                result[key] = JSON.parse(value);
            } catch (e) {
                console.error(`Failed to parse JSON for key "${key}"`);
                result[key] = value;
            }
        } else {
            result[key] = value;
        }
    });
    return result;
};

/**
 * Проверяет валидность данных инициализации Telegram Mini App.
 * Использует HMAC-SHA256 для проверки подписи данных.
 * 
 * @param {string} initDataRaw - Сырая строка данных инициализации (без декодирования).
 * @param {string} botToken - Токен Telegram бота.
 * @returns {boolean} True, если подпись верна, иначе False.
 */
const verifyTelegramInitData = (initDataRaw, botToken) => {
    const data = new URLSearchParams(initDataRaw);
    const hash = data.get('hash');
    data.delete('hash');
    data.sort();

    const dataCheckString = Array.from(data.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

    return calculatedHash === hash;
};

// ... (POST /api/users/auth - Public endpoint)
/**
 * @route POST /api/users/auth
 * @description Аутентификация пользователя через Telegram Init Data.
 * Если пользователь существует, возвращает токен.
 * Если нет, возвращает объект гостя без токена и флага isRegistered: false.
 * 
 * @param {Object} req.body.initData - Сырые данные инициализации Telegram.
 * @param {string} req.body.user - JSON строка с данными пользователя.
 * @returns {Object} JSON с токеном (если есть) и данными пользователя.
 */
app.post('/api/users/auth', async (req, res) => {
    // ... (existing implementation)
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    const { initData: rawInitData, user: userData } = req.body;
    if (!rawInitData || !userData) {
        return res.status(400).json({ message: 'Missing Telegram initialization data' });
    }
    const isValid = verifyTelegramInitData(userData, BOT_TOKEN);
    if (!isValid) {
        return res.status(401).json({ message: 'Invalid Telegram data signature' });
    }
    try {
        const tg = parseQueryToNestedJson(userData);
        let user = await User.findOne({ telegram_id: tg.user.id });

        if (!user) {
            // Пользователь не найден, возвращаем объект гостя без сохранения в БД
            const guestUser = {
                telegram_id: tg.user.id,
                first_name: tg.user.first_name,
                last_name: tg.user.last_name || null,
                username: tg.user.username || null,
                photo_url: tg.user.photo_url || null,
                role: 'guest',
                isRegistered: false
            };
            return res.status(200).json({
                valid: true,
                token: null,
                user: guestUser
            });
        }

        // Пользователь найден, обновляем данные (опционально) и выдаем токен
        user.first_name = tg.user.first_name;
        user.last_name = tg.user.last_name || null;
        user.username = tg.user.username || null;
        user.photo_url = tg.user.photo_url || null;
        await user.save();

        const token = jwt.sign({ userId: user._id, telegramId: user.telegram_id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });

        res.status(200).json({
            valid: true,
            token: token,
            user: { ...user.toObject(), isRegistered: true }
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Auth error" });
    }
});

/**
 * @route POST /api/users/register
 * @description Регистрация нового пользователя (запрос доступа).
 * Создает пользователя в БД с ролью guest и уведомляет админа.
 * 
 * @param {Object} req.body.initData - Сырые данные инициализации Telegram.
 * @param {string} req.body.user - JSON строка с данными пользователя.
 * @returns {Object} JSON с токеном и данными пользователя.
 */
app.post('/api/users/register', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    const { initData: rawInitData, user: userData } = req.body;

    if (!rawInitData || !userData) {
        return res.status(400).json({ message: 'Missing Telegram initialization data' });
    }
    const isValid = verifyTelegramInitData(userData, BOT_TOKEN);
    if (!isValid) {
        return res.status(401).json({ message: 'Invalid Telegram data signature' });
    }

    try {
        const tg = parseQueryToNestedJson(userData);
        let user = await User.findOne({ telegram_id: tg.user.id });

        if (user) {
            return res.status(400).json({ message: 'User already registered' });
        }

        user = new User({
            telegram_id: tg.user.id,
            first_name: tg.user.first_name,
            last_name: tg.user.last_name || null,
            username: tg.user.username || null,
            photo_url: tg.user.photo_url || null,
            role: 'guest'
        });
        await user.save();

        const notifyMessage = `@${user.username || user.first_name} запрашивает доступ к бронированию.`;
        await notifyAdmins(notifyMessage);

        const token = jwt.sign({ userId: user._id, telegramId: user.telegram_id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });

        res.status(201).json({
            valid: true,
            token: token,
            user: { ...user.toObject(), isRegistered: true }
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Registration error" });
    }
});

// Protected Endpoints

/**
 * @route GET /api/users
 * @description Получает список всех пользователей.
 * @access Protected
 * @returns {Array<Object>} Список пользователей.
 */
app.get('/api/users', authenticateToken, verifyUserExists, async (req, res) => {
    try {
        // Optional: Check if admin using actual DB role
        // if (req.dbUser.role !== 'admin') return res.sendStatus(403);

        const users = await User.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Admin endpoints

/**
 * @route PUT /api/users/:id/role
 * @description Изменяет роль пользователя. Только для администраторов.
 * @access Admin
 * @param {string} req.params.id - ID пользователя.
 * @param {string} req.body.role - Новая роль ('admin', 'user', 'guest').
 * @returns {Object} Обновленный объект пользователя.
 */
app.put('/api/users/:id/role', authenticateToken, verifyUserExists, async (req, res) => {
    // Strict Admin check using actual DB role
    if (req.dbUser.role !== 'admin' && req.dbUser.role !== 'super_admin') {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!['super_admin', 'admin', 'user', 'guest'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role provided.' });
    }

    try {
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const oldRole = user.role;
        user.role = role;
        await user.save();

        if (oldRole === 'guest' && role === 'user') {
            try {
                const message = `
                    Авторизация подтверждена, теперь вы можете бронировать репетиции, для этого запустите мини аппку по кнопке
                `
                await bot.telegram.sendMessage(user.telegram_id, message, Markup.inlineKeyboard([
                    [Markup.button.webApp('Запустить мини аппку', miniAppUrl)]
                ]));
            } catch (e) {
                console.error('Failed to send telegram notification:', e);
            }
        }

        res.json(user);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

/**
 * @route DELETE /api/users/:id
 * @description Удаляет пользователя. Только для администраторов.
 * @access Admin
 * @param {string} req.params.id - ID пользователя для удаления.
 * @returns {Object} Сообщение об успешном удалении.
 */
app.delete('/api/users/:id', authenticateToken, verifyUserExists, async (req, res) => {
    // Strict Admin check using actual DB role
    if (req.dbUser.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;

    try {
        const user = await User.findByIdAndDelete(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        res.json({ message: 'User deleted successfully.' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// app.post('/api/users/new', ...); // Keeping this open or protected? Likely for dev seeding, let's protect it or remove it in prod. Leaving as is for now but marking as risky.

// Booking Rehearsal - Protected

/**
 * @route POST /api/book
 * @description Создает бронирование репетиции.
 * @access Protected (User/Admin)
 * @param {string} req.body.date - Дата бронирования (DD/MM/YYYY).
 * @param {Array<string>} req.body.hours - Массив часов для бронирования.
 * @param {string} req.body.band_name - Название группы (опционально).
 * @returns {Object} Обновленный объект репетиции.
 */
app.post('/api/book', authenticateToken, verifyUserExists, async (req, res) => {
    try {
        const { date, hours, band_name, rehearsalType } = req.body;
        // Получаем username и userId из верифицированных данных БД
        const username = req.dbUser.username || req.dbUser.first_name;
        const userId = req.dbUser._id;
        const userPhotoUrl = req.dbUser.photo_url;

        // Check role from DB
        if (req.dbUser.role === 'guest') {
            return res.status(403).json({ error: 'Guests cannot book rehearsals.' });
        }

        // 1. Input Validation
        if (!date || !hours || !Array.isArray(hours) || hours.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid booking data.' });
        }

        const dateMoment = moment.utc(date, 'DD/MM/YYYY');
        if (!dateMoment.isValid()) {
            return res.status(400).json({ error: 'Invalid date format. Please use DD/MM/YYYY.' });
        }
        const bookingDate = dateMoment.startOf('day').toDate();

        // 2. Find the document for the day
        let rehearsalDoc = await Rehearsal.findOne({ date: bookingDate });

        // 2.1. Если документ существует, но hours не массив — исправляем
        if (rehearsalDoc && !Array.isArray(rehearsalDoc.hours)) {
            await Rehearsal.updateOne(
                { _id: rehearsalDoc._id },
                { $set: { hours: [] } }
            );
            rehearsalDoc = await Rehearsal.findOne({ date: bookingDate });
        }

        // 3. Check for conflicts
        const conflictingHours = [];
        if (rehearsalDoc && Array.isArray(rehearsalDoc.hours)) {
            const bookedHours = rehearsalDoc.hours.map(slot => slot.hour);
            for (const hour of hours) {
                if (bookedHours.includes(hour)) {
                    conflictingHours.push(hour);
                }
            }
        }

        if (conflictingHours.length > 0) {
            return res.status(409).json({
                error: 'Some hours are already booked.',
                conflictingHours,
            });
        }

        // 4. Create the new booking sub-documents
        const newBookings = hours.map(hour => ({
            hour,
            userId,
            username,
            band_name,
            userPhotoUrl,
            rehearsalType
        }));

        // 5. Atomically push new hours to the document
        const updatedRehearsal = await Rehearsal.findOneAndUpdate(
            { date: bookingDate },
            { $push: { hours: { $each: newBookings } } },
            { new: true, upsert: true }
        );
        console.log('username: ', username, date, hours.join(','))
        const BOOK_MESSAGE = `
**РЕПЕТИЦИЯ**

👨‍💻 @${username}

📅 ${date.replaceAll('/', '.')} 
🕓 ${formatHoursRange(hours)}
        `
        await notifyAdmins(BOOK_MESSAGE);

        // Broadcast WebSocket update to all clients
        broadcastUpdate('booking_update', {
            date,
            hours: updatedRehearsal.hours.map(h => ({
                hour: h.hour,
                userId: h.userId,
                username: h.username,
                band_name: h.band_name,
                userPhotoUrl: h.userPhotoUrl
            }))
        });

        return res.status(201).json(updatedRehearsal);
    } catch (err) {
        console.error('An error occurred during booking:', err);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

// Cancel Booking - Protected

/**
 * @route DELETE /api/cancel
 * @description Отменяет бронирование репетиции.
 * @access Protected (User can cancel own, Admin can cancel any)
 * @param {string} req.body.date - Дата бронирования (DD/MM/YYYY).
 * @param {Array<string>} req.body.hours - Массив часов для отмены.
 * @returns {Object} Сообщение об успешной отмене и обновленные данные.
 */
app.delete('/api/cancel', authenticateToken, verifyUserExists, async (req, res) => {
    try {
        const { date, hours } = req.body;
        // Получаем username и userId из верифицированных данных БД
        const username = req.dbUser.username || req.dbUser.first_name;
        const userId = req.dbUser._id;
        const isAdmin = req.dbUser.role === 'admin';

        // 1. Input Validation
        if (!date || !hours || !Array.isArray(hours) || hours.length === 0) {
            return res.status(400).json({ error: 'Missing or invalid cancellation data.' });
        }

        const dateMoment = moment.utc(date, 'DD/MM/YYYY');
        if (!dateMoment.isValid()) {
            return res.status(400).json({ error: 'Invalid date format. Expected DD/MM/YYYY.' });
        }

        const startOfDay = dateMoment.startOf('day').toDate();
        const endOfDay = dateMoment.endOf('day').toDate();

        let rehearsalDoc = await Rehearsal.findOne({
            date: {
                $gte: startOfDay,
                $lte: endOfDay,
            }
        });

        if (!rehearsalDoc) {
            return res.status(404).json({ error: 'No bookings found for this day.' });
        }

        // Если hours не массив — исправляем
        if (!Array.isArray(rehearsalDoc.hours)) {
            await Rehearsal.updateOne(
                { _id: rehearsalDoc._id },
                { $set: { hours: [] } }
            );
            return res.status(404).json({ error: 'No bookings found for this day.' });
        }

        // 2. Filter out hours the user is not authorized to cancel.
        const hoursToCancel = hours.filter(hour => {
            const booking = rehearsalDoc.hours.find(h => h.hour === hour);
            // Strict check: if admin, can cancel any. If user, must match userId.
            return booking && (isAdmin || String(booking.userId) === String(userId));
        });

        if (hoursToCancel.length === 0) {
            console.log(`Cancel failed for user ${userId}. Requested: ${hours.join(',')}. Found docs matching user:`,
                rehearsalDoc.hours.filter(h => hours.includes(h.hour)).map(h => ({ h: h.hour, u: h.userId }))
            );
            return res.status(403).json({ error: 'You are not authorized to cancel any of the selected bookings or they do not exist.' });
        }

        const updatedRehearsal = await Rehearsal.findOneAndUpdate(
            { _id: rehearsalDoc._id },
            {
                $pull: {
                    hours: {
                        hour: { $in: hoursToCancel },
                        ...(isAdmin ? {} : { userId: userId })
                    }
                }
            },
            { new: true }
        );
        const CANCEL_MESSAGE_ADMIN = `
**ОТМЕНА**

👨‍💻 @${username}

📅 ${date.replaceAll('/', '.')} 
🕓 ${formatHoursRange(hoursToCancel)}
        `
        const CANCEL_MESSAGE_USER = `
**ОТМЕНА**
    
📅 ${date.replaceAll('/', '.')}
🕓 ${formatHoursRange(hoursToCancel)}

Репетиция была отменена администратором
        `

        // Логика уведомлений
        if (isAdmin) {
            // Администратор отменяет бронирования
            // Нужно найти пользователей, чьи брони были отменены
            // hoursToCancel содержит список часов
            // Мы можем найти userId для каждого часа из hoursToCancel в исходном rehearsalDoc
            const affectedUserIds = [...new Set(rehearsalDoc.hours
                .filter(h => hoursToCancel.includes(h.hour))
                .map(h => h.userId))];

            for (const affectedUserId of affectedUserIds) {
                try {
                    // Найти telegram_id пользователя по affectedUserId
                    const affectedUser = await User.findById(affectedUserId);
                    if (affectedUser) {
                        await bot.telegram.sendMessage(affectedUser.telegram_id, CANCEL_MESSAGE_USER);
                    }
                } catch (e) {
                    console.error(`Failed to notify user ${affectedUserId} about cancellation:`, e);
                }
            }
        } else {
            // Пользователь отменяет свое бронирование - уведомляем всех админов
            await notifyAdmins(CANCEL_MESSAGE_ADMIN);
        }

        if (updatedRehearsal && updatedRehearsal.hours.length === 0) {
            await Rehearsal.deleteOne({ _id: updatedRehearsal._id });

            // Broadcast WebSocket update - all bookings removed for this day
            broadcastUpdate('booking_cancel', {
                date,
                hours: []
            });

            return res.status(200).json({ message: 'All bookings for this day canceled, document deleted.' });
        }

        if (!updatedRehearsal) {
            return res.status(404).json({ error: 'Booking not found or already canceled.' });
        }

        // Broadcast WebSocket update with remaining hours
        broadcastUpdate('booking_cancel', {
            date,
            hours: updatedRehearsal.hours.map(h => ({
                hour: h.hour,
                userId: h.userId,
                username: h.username,
                band_name: h.band_name,
                userPhotoUrl: h.userPhotoUrl
            }))
        });

        res.status(200).json({
            message: 'Bookings canceled successfully.',
            rehearsal: updatedRehearsal
        });

    } catch (err) {
        console.error('An error occurred during cancellation:', err);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

// Read-only endpoints - can remain public for viewing timetable? Or protect them too?
// Usually viewing timetable is public. Keeping public for now or adding auth if required by privacy.

/**
 * @route GET /api/timetable
 * @description Получает список дат текущего месяца, в которые есть бронирования.
 * Используется для подсветки дат в календаре.
 * @access Public
 * @param {string} req.query.date - Дата (DD/MM/YYYY) для определения месяца.
 * @returns {Object} JSON с массивом дат (строки DD/MM/YYYY).
 */
app.get('/api/timetable', async (req, res) => {
    // ... (existing implementation)
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');

    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ error: 'Missing or invalid booking date.' });
        }
        const dateMoment = moment(date, 'DD/MM/YYYY');
        if (!dateMoment.isValid()) {
            return res.status(400).json({ error: 'Invalid date format. Please use DD/MM/YYYY.' });
        }

        const dateFrom = dateMoment.startOf('month').toDate();
        const dateTo = dateMoment.endOf('month').toDate();

        const searchResults = await Rehearsal.find({
            date: {
                $gte: dateFrom,
                $lte: dateTo,
            },
            hours: { $ne: [] }
        });

        const datesToHighlight = searchResults.map(doc => moment(doc.date).format('DD/MM/YYYY'));

        res.status(200).json({ result: datesToHighlight });
    } catch (err) {
        console.error('An error occurred while fetching booked hours:', err);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

/**
 * @route GET /api/hours
 * @description Получает список забронированных часов на конкретную дату.
 * @access Public
 * @param {string} req.query.date - Дата (DD/MM/YYYY).
 * @returns {Object} JSON с массивом забронированных часов (объекты с hour, userId, etc.).
 */
app.get('/api/hours', async (req, res) => {
    // ... (existing implementation)
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');

    try {
        const { date } = req.query;
        if (!date) {
            return res.status(400).json({ message: 'Date query parameter is required.' });
        }

        const dateMoment = moment.utc(date, 'DD/MM/YYYY');
        if (!dateMoment.isValid()) {
            return res.status(400).json({ message: 'Invalid date format. Expected DD/MM/YYYY.' });
        }

        const startOfDay = dateMoment.startOf('day').toDate();
        const endOfDay = dateMoment.endOf('day').toDate();

        const rehearsalRecord = await Rehearsal.findOne({
            date: {
                $gte: startOfDay,
                $lte: endOfDay
            }
        });

        if (!rehearsalRecord) {
            return res.status(200).json({ hours: [] });
        }

        // Нормализуем данные из БД (поддержка старого и нового формата)
        const normalizedHours = normalizeHoursData(rehearsalRecord.hours);

        return res.status(200).json({ hours: normalizedHours });

    } catch (error) {
        console.error('Error fetching hours:', error);
        return res.status(500).json({ message: 'Server error' });
    }
});

// ============================================
// Invite Code Endpoints
// ============================================

/**
 * @route POST /api/invite/generate
 * @description Генерирует одноразовый инвайт-код. Только для админов.
 * @access Admin
 * @returns {Object} JSON с кодом и ссылкой-приглашением.
 */
app.post('/api/invite/generate', authenticateToken, verifyUserExists, async (req, res) => {
    if (req.dbUser.role !== 'admin' && req.dbUser.role !== 'super_admin') {
        return res.status(403).json({ message: 'Access denied' });
    }

    try {
        const code = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + INVITE_CODE_TTL_SECONDS * 1000);

        const inviteCode = new InviteCode({
            code,
            createdBy: req.dbUser._id,
            expiresAt,
        });
        await inviteCode.save();

        const inviteLink = `${miniAppUrl}?startapp=${code}`;

        res.status(201).json({
            code,
            inviteLink,
            expiresAt,
        });
    } catch (err) {
        console.error('Error generating invite code:', err);
        res.status(500).json({ message: 'Failed to generate invite code.' });
    }
});

/**
 * @route GET /api/invite/validate/:code
 * @description Проверяет валидность инвайт-кода. Публичный эндпоинт.
 * Если документ существует в коллекции — код валиден (просроченные удаляются MongoDB автоматически).
 * @access Public
 * @param {string} req.params.code - Инвайт-код.
 * @returns {Object} JSON с полем valid (boolean).
 */
app.get('/api/invite/validate/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const inviteCode = await InviteCode.findOne({ code });

        if (!inviteCode) {
            return res.status(200).json({ valid: false });
        }

        res.status(200).json({ valid: true });
    } catch (err) {
        console.error('Error validating invite code:', err);
        res.status(500).json({ message: 'Failed to validate invite code.' });
    }
});

/**
 * @route POST /api/invite/use
 * @description Использует инвайт-код для регистрации пользователя.
 * Создаёт пользователя в БД с ролью guest и удаляет использованный код.
 * @access Public (требует Telegram initData)
 * @param {string} req.body.code - Инвайт-код.
 * @param {string} req.body.initData - Сырые данные инициализации Telegram.
 * @param {string} req.body.user - JSON строка с данными пользователя.
 * @returns {Object} JSON с токеном и данными пользователя.
 */
app.post('/api/invite/use', async (req, res) => {
    const { code, initData: rawInitData, user: userData } = req.body;

    if (!code || !rawInitData || !userData) {
        return res.status(400).json({ message: 'Missing required data.' });
    }

    const isValid = verifyTelegramInitData(userData, BOT_TOKEN);
    if (!isValid) {
        return res.status(401).json({ message: 'Invalid Telegram data signature.' });
    }

    try {
        // Атомарно находим и удаляем код — гарантирует одноразовость даже при параллельных запросах
        const inviteCode = await InviteCode.findOneAndDelete({ code });
        if (!inviteCode) {
            return res.status(400).json({ message: 'Invalid or expired invite code.' });
        }

        const tg = parseQueryToNestedJson(userData);

        // Проверяем, не зарегистрирован ли уже пользователь
        let user = await User.findOne({ telegram_id: tg.user.id });
        if (user) {
            // Пользователь уже существует — код уже удалён, возвращаем существующего
            const token = jwt.sign(
                { userId: user._id, telegramId: user.telegram_id, role: user.role },
                JWT_SECRET,
                { expiresIn: '1d' }
            );

            return res.status(200).json({
                valid: true,
                token,
                user: { ...user.toObject(), isRegistered: true },
            });
        }

        // Создаём нового пользователя с ролью guest
        user = new User({
            telegram_id: tg.user.id,
            first_name: tg.user.first_name,
            last_name: tg.user.last_name || null,
            username: tg.user.username || null,
            photo_url: tg.user.photo_url || null,
            role: 'guest',
        });
        await user.save();

        // Уведомляем всех админов
        const inviteNotifyMessage = `@${user.username || user.first_name} запрашивает доступ к бронированию (по инвайт-ссылке).`;
        await notifyAdmins(inviteNotifyMessage);

        const token = jwt.sign(
            { userId: user._id, telegramId: user.telegram_id, role: user.role },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.status(201).json({
            valid: true,
            token,
            user: { ...user.toObject(), isRegistered: true },
        });
    } catch (err) {
        console.error('Error using invite code:', err);
        res.status(500).json({ message: 'Failed to use invite code.' });
    }
});

// Use server.listen instead of app.listen to enable WebSocket support
server.listen(port, () => {
    console.log(`Server with WebSocket support listening on port ${port}`)
});
