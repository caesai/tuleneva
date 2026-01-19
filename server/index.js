// server/index.js

/**
 * @file index.js
 * @description Основной файл сервера Express приложения.
 * Содержит настройку сервера, подключение к MongoDB, инициализацию Telegram бота,
 * middleware для аутентификации и API эндпоинты.
 */

// ... (existing imports)
const express = require('express')
const app = express();
const cors = require('cors');
const port = process.env.PORT || 3000;
const { Telegraf, Markup } = require('telegraf');
const { message } = require('telegraf/filters');
const moment = require('moment');
const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const path = require('path');
// Попытка загрузить .env из текущей директории
require("dotenv").config();

// Если переменные не загрузились (например, при запуске из dist/), пробуем найти .env на уровень выше
if (!process.env.TELEGRAM_TOKEN) {
    require("dotenv").config({ path: path.resolve(__dirname, '../.env') });
}

const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const JWT_SECRET = process.env.JWT_SECRET; // Ensure this is loaded

if (!BOT_TOKEN) {
    console.error('ERROR: TELEGRAM_TOKEN is not defined in .env file or environment variables.');
    process.exit(1);
}

// Import the User model
const User = require('./models/User');
const Rehearsal = require('./models/Rehearsal');

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
const miniAppUrl = 'https://tuleneva25.ru/';
bot.start((ctx) => ctx.reply(BOT_START_MESSAGE,
    Markup.inlineKeyboard([
        [Markup.button.webApp('🕓 Расписание студии', miniAppUrl)]
    ])));
bot.launch();
const TELEGRAM_ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;
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

        const message = `
            @${user.username || user.first_name} запрашивает доступ к бронированию.
        `;
        try {
            await bot.telegram.sendMessage(TELEGRAM_ADMIN_ID, message);
        } catch (e) {
            console.error('Failed to send admin notification:', e);
        }

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
    if (req.dbUser.role !== 'admin') {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'user', 'guest'].includes(role)) {
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
        const { date, hours, band_name } = req.body;
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
        const rehearsalDoc = await Rehearsal.findOne({ date: bookingDate });

        // 3. Check for conflicts
        const conflictingHours = [];
        if (rehearsalDoc) {
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
            userPhotoUrl
        }));

        // 5. Atomically push new hours to the document
        const updatedRehearsal = await Rehearsal.findOneAndUpdate(
            { date: bookingDate },
            { $push: { hours: { $each: newBookings } } },
            { new: true, upsert: true }
        );
        console.log('username: ', username, date, hours.join(','))
        const BOOK_MESSAGE = `
        👨‍💻: @${username} забронировал репетицию 📅:${date.replaceAll('/', '.')} 🕓:${hours.join(',')}
        `
        await bot.telegram.sendMessage(TELEGRAM_ADMIN_ID, BOOK_MESSAGE);
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

        const rehearsalDoc = await Rehearsal.findOne({
            date: {
                $gte: startOfDay,
                $lte: endOfDay,
            }
        });

        if (!rehearsalDoc) {
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
        👨‍💻: @${username} отменил репетицию 📅:${date.replaceAll('/', '.')} 🕓:${hours.join(',')}
        `
        const CANCEL_MESSAGE_USER = `
        Ваша репетиция 📅:${date.replaceAll('/', '.')} 🕓:${hours.join(',')} была отменена администратором
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
            // Пользователь отменяет свое бронирование - уведомляем админа
            await bot.telegram.sendMessage(TELEGRAM_ADMIN_ID, CANCEL_MESSAGE_ADMIN);
        }

        if (updatedRehearsal && updatedRehearsal.hours.length === 0) {
            await Rehearsal.deleteOne({ _id: updatedRehearsal._id });
            return res.status(200).json({ message: 'All bookings for this day canceled, document deleted.' });
        }

        if (!updatedRehearsal) {
            return res.status(404).json({ error: 'Booking not found or already canceled.' });
        }
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

        return res.status(200).json({ hours: rehearsalRecord.hours });

    } catch (error) {
        console.error('Error fetching hours:', error);
        return res.status(500).json({ message: 'Server error' });
    }
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
});
