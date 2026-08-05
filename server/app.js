/**
 * Express application factory (no listen, no Telegraf launch).
 */
const express = require('express');
const cors = require('cors');
const moment = require('moment');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Markup } = require('telegraf');

const User = require('./models/User');
const Rehearsal = require('./models/Rehearsal');
const InviteCode = require('./models/InviteCode');
const { INVITE_CODE_TTL_SECONDS } = require('./models/InviteCode');
const { createAuthRouter } = require('./auth/authRoutes');
const { signAuthToken, buildAuthResponse } = require('./auth/tokenService');
const {
    parseTelegramUser,
    verifyTelegramInitData,
    parseQueryToNestedJson,
} = require('./auth/telegramProvider');
const {
    findUserByTelegramId,
    upsertTelegramUser,
    buildTelegramGuestUser,
} = require('./auth/identityService');
const { isAdminLike, canAssignRole, canDeleteUser } = require('./auth/roleHelpers');
const { requireAdmin } = require('./auth/requireAdmin');
const { createOptionalAuth } = require('./auth/optionalAuth');
const {
    canViewBookingUserDetails,
    sanitizeHoursForViewer,
} = require('./auth/hourPrivacy');
const { safeNotify } = require('./notifications/telegramNotify');

/**
 * @param {object} options
 * @param {string} options.jwtSecret
 * @param {string} options.botToken
 * @param {string} [options.miniAppUrl]
 * @param {string} [options.webAppBaseUrl]
 * @param {Function} [options.notifyAdmins]
 * @param {Function} [options.notifyUser] - Отправка сообщения пользователю (с таймаутом)
 * @param {Function} [options.broadcastUpdate]
 */
const createApp = ({
    jwtSecret,
    botToken,
    miniAppUrl = 'https://t.me/tuleneva25_bot',
    webAppBaseUrl = 'https://tuleneva25.ru',
    notifyAdmins = async () => {},
    notifyUser = async () => {},
    broadcastUpdate = () => {},
}) => {
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

    const app = express();
    app.use(cors());
    app.use(express.json());

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', 'https://tuleneva25.ru'); // Replace with your frontend's origin
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

    jwt.verify(token, jwtSecret, (err, user) => {
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
const optionalAuthenticate = createOptionalAuth(jwtSecret);

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

app.use('/api/auth', createAuthRouter({
    jwtSecret: jwtSecret,
    botToken: botToken,
    miniAppUrl,
    webAppBaseUrl: webAppBaseUrl,
    authenticateToken,
    verifyUserExists,
    notifyAdmins,
}));

app.get('/', (req, res) => {
    res.send('Hello World!');
});

// parseQueryToNestedJson, verifyTelegramInitData — из ./auth/telegramProvider.js

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
/** @deprecated Используйте POST /api/auth/providers/telegram/login */
app.post('/api/users/auth', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    const { user: userData } = req.body;
    try {
        const tg = parseTelegramUser(userData, botToken);
        let user = await findUserByTelegramId(tg.user.id);

        if (!user) {
            return res.status(200).json({
                valid: true,
                token: null,
                authProvider: 'telegram',
                user: buildTelegramGuestUser(tg.user),
            });
        }

        user = await upsertTelegramUser(tg.user);
        const token = user.role === 'guest' ? null : signAuthToken(user, jwtSecret);
        res.status(200).json(buildAuthResponse(user, token, 'telegram'));
    } catch (error) {
        console.log(error);
        res.status(401).json({ valid: false, message: error.message || 'Auth error' });
    }
});

/** Совместимость: GET /api/users/info */
app.get('/api/users/info', authenticateToken, verifyUserExists, async (req, res) => {
    const token = signAuthToken(req.dbUser, jwtSecret);
    const provider = req.dbUser.identities?.[0]?.provider || (req.dbUser.telegram_id ? 'telegram' : null);
    res.status(200).json(buildAuthResponse(req.dbUser, token, provider));
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
/** @deprecated Используйте POST /api/auth/providers/telegram/register */
app.post('/api/users/register', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    const { user: userData } = req.body;
    try {
        const tg = parseTelegramUser(userData, botToken);
        const existing = await findUserByTelegramId(tg.user.id);
        if (existing) {
            return res.status(400).json({ valid: false, message: 'User already registered' });
        }
        const user = await upsertTelegramUser(tg.user, { role: 'guest' });
        const token = signAuthToken(user, jwtSecret);
        res.status(201).json(buildAuthResponse(user, token, 'telegram'));
        safeNotify(
            notifyAdmins(`@${user.username || user.first_name} запрашивает доступ к бронированию.`),
        );
    } catch (error) {
        console.log(error);
        res.status(500).json({ valid: false, message: 'Registration error' });
    }
});

// Protected Endpoints

/**
 * @route GET /api/users
 * @description Получает список всех пользователей.
 * @access Admin
 * @returns {Array<Object>} Список пользователей.
 */
app.get('/api/users', authenticateToken, verifyUserExists, requireAdmin, async (req, res) => {
    try {
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
    if (!isAdminLike(req.dbUser.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;
    const { role } = req.body;

    if (!['super_admin', 'admin', 'user', 'guest'].includes(role)) {
        return res.status(400).json({ message: 'Invalid role provided.' });
    }

    if (String(id) === String(req.dbUser._id)) {
        return res.status(403).json({ message: 'Cannot change your own role.' });
    }

    try {
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (!canAssignRole(req.dbUser.role, user.role, role)) {
            return res.status(403).json({ message: 'Insufficient permissions to assign this role.' });
        }

        const oldRole = user.role;
        user.role = role;
        await user.save();

        res.json(user);

        if (oldRole === 'guest' && role === 'user' && user.telegram_id) {
            const message = `
                    Авторизация подтверждена, теперь вы можете бронировать репетиции, для этого запустите мини аппку по кнопке
                `;
            safeNotify(
                notifyUser(
                    user.telegram_id,
                    message,
                    Markup.inlineKeyboard([
                        [Markup.button.webApp('Запустить мини аппку', miniAppUrl)],
                    ]),
                ),
            );
        }
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
    if (!isAdminLike(req.dbUser.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;

    try {
        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (!canDeleteUser(req.dbUser.role, targetUser, req.dbUser._id)) {
            return res.status(403).json({ message: 'Insufficient permissions to delete this user.' });
        }

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
        console.log('username: ', username, date, hours.join(','));
        const BOOK_MESSAGE = `
**РЕПЕТИЦИЯ**

👨‍💻 @${username}

📅 ${date.replaceAll('/', '.')} 
🕓 ${formatHoursRange(hours)}
        `;

        // WebSocket: только публичные поля (PII — через GET /api/hours с токеном)
        broadcastUpdate('booking_update', {
            date,
            hours: sanitizeHoursForViewer(normalizeHoursData(updatedRehearsal.hours), false),
        });

        res.status(201).json(updatedRehearsal);
        safeNotify(notifyAdmins(BOOK_MESSAGE));
        return;
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
        const isAdmin = isAdminLike(req.dbUser.role);

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

        /**
         * Фоновые Telegram-уведомления после ответа клиенту.
         * @returns {Promise<void>}
         */
        const sendCancelNotifications = async () => {
            if (isAdmin) {
                const affectedUserIds = [...new Set(rehearsalDoc.hours
                    .filter((h) => hoursToCancel.includes(h.hour))
                    .map((h) => h.userId))];

                await Promise.allSettled(
                    affectedUserIds.map(async (affectedUserId) => {
                        try {
                            const affectedUser = await User.findById(affectedUserId);
                            if (affectedUser?.telegram_id) {
                                await notifyUser(affectedUser.telegram_id, CANCEL_MESSAGE_USER);
                            }
                        } catch (e) {
                            console.error(
                                `Failed to notify user ${affectedUserId} about cancellation:`,
                                e?.code || e?.message || e,
                            );
                        }
                    }),
                );
            } else {
                await notifyAdmins(CANCEL_MESSAGE_ADMIN);
            }
        };

        if (updatedRehearsal && updatedRehearsal.hours.length === 0) {
            await Rehearsal.deleteOne({ _id: updatedRehearsal._id });

            broadcastUpdate('booking_cancel', {
                date,
                hours: [],
            });

            res.status(200).json({ message: 'All bookings for this day canceled, document deleted.' });
            safeNotify(sendCancelNotifications());
            return;
        }

        if (!updatedRehearsal) {
            return res.status(404).json({ error: 'Booking not found or already canceled.' });
        }

        // WebSocket: только публичные поля
        broadcastUpdate('booking_cancel', {
            date,
            hours: sanitizeHoursForViewer(normalizeHoursData(updatedRehearsal.hours), false),
        });

        res.status(200).json({
            message: 'Bookings canceled successfully.',
            rehearsal: updatedRehearsal,
        });
        safeNotify(sendCancelNotifications());
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
 * @access Public (опциональный Bearer JWT: полные данные только для role !== guest)
 * @param {string} req.query.date - Дата (DD/MM/YYYY).
 * @returns {Object} JSON с массивом слотов; PII только для авторизованных участников.
 */
app.get('/api/hours', optionalAuthenticate, async (req, res) => {
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
        const canViewDetails = canViewBookingUserDetails(req.dbUser);
        const hours = sanitizeHoursForViewer(normalizedHours, canViewDetails);

        return res.status(200).json({ hours });

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
        const webInviteLink = `${webAppBaseUrl.replace(/\/$/, '')}/?invite=${code}`;

        res.status(201).json({
            code,
            inviteLink,
            webInviteLink,
            telegramInviteLink: inviteLink,
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

    const isValid = verifyTelegramInitData(userData, botToken);
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
                jwtSecret,
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

        const token = jwt.sign(
            { userId: user._id, telegramId: user.telegram_id, role: user.role },
            jwtSecret,
            { expiresIn: '1d' }
        );

        res.status(201).json({
            valid: true,
            token,
            user: { ...user.toObject(), isRegistered: true },
        });

        const inviteNotifyMessage = `@${user.username || user.first_name} запрашивает доступ к бронированию (по инвайт-ссылке).`;
        safeNotify(notifyAdmins(inviteNotifyMessage));
    } catch (err) {
        console.error('Error using invite code:', err);
        res.status(500).json({ message: 'Failed to use invite code.' });
    }
});

    return app;
};

module.exports = { createApp };
