/**
 * Express application factory (no listen, no Telegraf launch).
 */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Markup } = require('telegraf');

const User = require('./models/User');
const InviteCode = require('./models/InviteCode');
const { INVITE_CODE_TTL_SECONDS } = require('./models/InviteCode');
const { createAuthRouter } = require('./auth/authRoutes');
const { signAuthToken, buildAuthResponse, toPublicUser } = require('./auth/tokenService');
const {
    parseTelegramUser,
} = require('./auth/telegramProvider');
const {
    findUserByTelegramId,
    upsertTelegramUser,
    buildTelegramGuestUser,
} = require('./auth/identityService');
const { isAdminLike, canAssignRole, canDeleteUser } = require('./auth/roleHelpers');
const { requireAdmin } = require('./auth/requireAdmin');
const { createOptionalAuth } = require('./auth/optionalAuth');
const { findValidInvite, consumeInvite } = require('./auth/inviteService');
const {
    linkEmailCredentials,
    mapDuplicateEmailError,
} = require('./auth/emailProvider');
const { createSmtpSendMail } = require('./auth/mailer');
const { safeNotify } = require('./notifications/telegramNotify');
const { createBooking } = require('./booking/createBooking');

/**
 * @param {object} options
 * @param {string} options.jwtSecret
 * @param {string} options.botToken
 * @param {string} [options.miniAppUrl]
 * @param {string} [options.webAppBaseUrl]
 * @param {Function} [options.notifyAdmins]
 * @param {Function} [options.notifyUser] - Отправка сообщения пользователю (с таймаутом)
 * @param {Function} [options.broadcastUpdate]
 * @param {Function|null} [options.sendMail] - Отправка писем; по умолчанию SMTP из env
 * @param {import('telegraf').Telegraf|null} [options.telegramBot] - Бот для webhook
 * @param {string|null} [options.telegramWebhookSecret] - X-Telegram-Bot-Api-Secret-Token
 */
const createApp = ({
    jwtSecret,
    botToken,
    miniAppUrl = 'https://t.me/tuleneva25_bot',
    webAppBaseUrl = 'https://tuleneva25.ru',
    notifyAdmins = async () => {},
    notifyUser = async () => {},
    broadcastUpdate = () => {},
    sendMail = undefined,
    telegramBot = null,
    telegramWebhookSecret = null,
}) => {
    const mailSender = sendMail === undefined ? createSmtpSendMail() : sendMail;
    const booking = createBooking({ broadcastUpdate, notifyAdmins, notifyUser });

    const app = express();
    app.use(cors({
        origin: webAppBaseUrl,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }));
    app.use(express.json({ limit: '32kb' }));

/**
 * @route GET /api/health
 * @description Liveness для CD: 200 только при живом соединении с MongoDB.
 */
app.get('/api/health', (req, res) => {
    const mongoOk = mongoose.connection.readyState === 1;
    if (!mongoOk) {
        return res.status(503).json({ ok: false, mongo: 'disconnected' });
    }
    return res.status(200).json({ ok: true, mongo: 'connected' });
});

/**
 * @route POST /api/telegram/webhook
 * @description Приём обновлений Telegram (вместо long polling на VPS без доступа к api.telegram.org).
 */
app.post('/api/telegram/webhook', (req, res) => {
    if (!telegramBot || !telegramWebhookSecret) {
        return res.sendStatus(404);
    }
    const header = req.get('X-Telegram-Bot-Api-Secret-Token');
    if (header !== telegramWebhookSecret) {
        console.warn(
            'Telegram webhook rejected: secret mismatch or missing header',
            header ? '(header present, value differs)' : '(header absent)',
        );
        return res.sendStatus(401);
    }
    console.log(
        'Telegram webhook update',
        req.body?.update_id,
        req.body?.message?.text || req.body?.message?.entities?.[0]?.type || '',
    );
    // Сразу 200, чтобы Telegram не ретраил; ответ пользователю уходит через Worker отдельно.
    res.sendStatus(200);
    telegramBot.handleUpdate(req.body).catch((err) => {
        console.error(
            'Telegram webhook handleUpdate failed:',
            err?.message || err,
            err?.on ? `on ${err.on.method || '?'}` : '',
        );
    });
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
    sendMail: mailSender,
    broadcastUpdate,
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
        broadcastUpdate('users_update', { reason: 'telegram_register_legacy' });
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
        res.json(users.map((u) => toPublicUser(u)));
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

        res.json(toPublicUser(user));
        broadcastUpdate('users_update', { reason: 'role_change' });

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
/**
 * @route PUT /api/users/:id/email-login
 * @description Админ задаёт почту и пароль; на почту уходит ссылка подтверждения.
 * @access Admin
 */
app.put('/api/users/:id/email-login', authenticateToken, verifyUserExists, async (req, res) => {
    if (!isAdminLike(req.dbUser.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;
    const { email, password } = req.body || {};

    try {
        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Те же границы, что для смены роли: admin не трогает admin/super_admin
        if (!canAssignRole(req.dbUser.role, targetUser.role, targetUser.role)) {
            return res.status(403).json({ message: 'Insufficient permissions to edit this user.' });
        }

        const { user: updated, pendingConfirmation } = await linkEmailCredentials(
            targetUser,
            email,
            password,
            {
                skipCurrentPassword: true,
                webAppBaseUrl,
                sendMail: mailSender,
            },
        );
        res.status(200).json({
            ...toPublicUser(updated),
            pendingConfirmation,
            message: pendingConfirmation
                ? 'Confirmation email sent'
                : 'Password updated',
        });
    } catch (err) {
        const mapped = mapDuplicateEmailError(err);
        console.error('Admin email-login error:', mapped);
        const status = mapped.status
            || (mapped.message?.includes('Invalid') || mapped.message?.includes('Password')
                || mapped.message?.includes('Current password')
                ? 400
                : 500);
        const message = mapped.status === 409
            ? 'Email already in use'
            : (mapped.status && mapped.status < 500
                ? mapped.message
                : 'Failed to set email login');
        res.status(status).json({ message });
    }
});

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
        broadcastUpdate('users_update', { reason: 'user_deleted' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// app.post('/api/users/new', ...); // Keeping this open or protected? Likely for dev seeding, let's protect it or remove it in prod. Leaving as is for now but marking as risky.

/**
 * @route POST /api/book
 * @description Создает бронирование репетиции (логика в createBooking).
 * @access Protected (User/Admin)
 * @param {string} req.body.date - Дата бронирования (DD/MM/YYYY).
 * @param {Array<string>} req.body.hours - Массив часов для бронирования.
 * @param {string} req.body.band_name - Название группы (опционально).
 * @returns {Object} Обновленный объект репетиции.
 */
app.post('/api/book', authenticateToken, verifyUserExists, async (req, res) => {
    try {
        const { date, hours, band_name, rehearsalType } = req.body;
        const result = await booking.book({
            dbUser: req.dbUser,
            date,
            hours,
            band_name,
            rehearsalType,
        });
        res.status(result.status).json(result.body);
        if (result.afterResponse) {
            safeNotify(result.afterResponse);
        }
    } catch (err) {
        console.error('An error occurred during booking:', err);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

/**
 * @route DELETE /api/cancel
 * @description Отменяет бронирование репетиции (логика в createBooking).
 * @access Protected (User can cancel own, Admin can cancel any)
 * @param {string} req.body.date - Дата бронирования (DD/MM/YYYY).
 * @param {Array<string>} req.body.hours - Массив часов для отмены.
 * @returns {Object} Сообщение об успешной отмене и обновленные данные.
 */
app.delete('/api/cancel', authenticateToken, verifyUserExists, async (req, res) => {
    try {
        const { date, hours } = req.body;
        const result = await booking.cancel({
            dbUser: req.dbUser,
            date,
            hours,
        });
        res.status(result.status).json(result.body);
        if (result.afterResponse) {
            safeNotify(result.afterResponse);
        }
    } catch (err) {
        console.error('An error occurred during cancellation:', err);
        res.status(500).json({ error: 'An internal server error occurred.' });
    }
});

/**
 * @route GET /api/timetable
 * @description Получает список дат текущего месяца, в которые есть бронирования.
 * Используется для подсветки дат в календаре.
 * @access Public
 * @param {string} req.query.date - Дата (DD/MM/YYYY) для определения месяца.
 * @returns {Object} JSON с массивом дат (строки DD/MM/YYYY).
 */
app.get('/api/timetable', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');

    try {
        const result = await booking.getMonthDates({ date: req.query.date });
        res.status(result.status).json(result.body);
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
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');

    try {
        const result = await booking.getDayHours({
            date: req.query.date,
            dbUser: req.dbUser,
        });
        return res.status(result.status).json(result.body);
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
 * @description Проверяет валидность инвайт-кода (не использован, не просрочен).
 * @deprecated Используйте GET /api/auth/invite/validate/:code
 */
app.get('/api/invite/validate/:code', async (req, res) => {
    try {
        const { code } = req.params;
        const inviteCode = await findValidInvite(code);
        res.status(200).json({
            valid: !!inviteCode,
            purpose: inviteCode?.purpose,
            allowedProviders: inviteCode?.allowedProviders,
        });
    } catch (err) {
        console.error('Error validating invite code:', err);
        res.status(500).json({ message: 'Failed to validate invite code.' });
    }
});

/**
 * @route POST /api/invite/use
 * @description Legacy: использует инвайт через Telegram init data (consumeInvite, без удаления досрочно).
 * @deprecated Используйте POST /api/auth/invite/use
 */
app.post('/api/invite/use', async (req, res) => {
    const { code, user: userData } = req.body;

    if (!code || !userData) {
        return res.status(400).json({ message: 'Missing required data.' });
    }

    try {
        const inviteCode = await findValidInvite(code);
        if (!inviteCode) {
            return res.status(400).json({ message: 'Invalid or expired invite code.' });
        }

        const tg = parseTelegramUser(userData, botToken);
        let user = await findUserByTelegramId(tg.user.id);
        let isNewUser = false;

        if (!user) {
            user = await upsertTelegramUser(tg.user, {
                role: inviteCode.initialRole || 'guest',
            });
            isNewUser = true;
        }

        const consumed = await consumeInvite(code, user._id);
        if (!consumed) {
            if (isNewUser) {
                await User.deleteOne({ _id: user._id });
            }
            return res.status(400).json({ message: 'Invalid or expired invite code.' });
        }

        const token = signAuthToken(user, jwtSecret);
        res.status(201).json(buildAuthResponse(user, token, 'telegram'));

        if (isNewUser) {
            const inviteNotifyMessage = `@${user.username || user.first_name} запрашивает доступ к бронированию (по инвайт-ссылке).`;
            safeNotify(notifyAdmins(inviteNotifyMessage));
        }
    } catch (err) {
        console.error('Error using invite code:', err);
        const status = err.message?.includes('Telegram') || err.message?.includes('signature')
            || err.message?.includes('auth_date') || err.message?.includes('expired')
            ? 401
            : 500;
        res.status(status).json({ message: err.message || 'Failed to use invite code.' });
    }
});

    return app;
};

module.exports = { createApp };
