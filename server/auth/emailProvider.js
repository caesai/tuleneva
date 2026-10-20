const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { findUserByIdentity, ensureIdentity } = require('./identityService');

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const EMAIL_CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** @type {Map<string, { count: number, resetAt: number }>} */
const loginAttempts = new Map();

/**
 * Нормализует адрес почты для хранения и поиска.
 * @param {string} email
 * @returns {string}
 */
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/**
 * Проверяет формат почты и длину пароля.
 * @param {string} email
 * @param {string} password
 * @throws {Error}
 */
const validateEmailCredentials = (email, password) => {
    const normalized = normalizeEmail(email);
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        throw new Error('Invalid email');
    }
    if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    return normalized;
};

/**
 * Хеширует пароль (bcryptjs, стоимость 12).
 * @param {string} password
 * @returns {Promise<string>}
 */
const hashPassword = async (password) => {
    return bcrypt.hash(String(password), BCRYPT_ROUNDS);
};

/**
 * Сравнивает пароль с хешем.
 * @param {string} password
 * @param {string} passwordHash
 * @returns {Promise<boolean>}
 */
const verifyPassword = async (password, passwordHash) => {
    if (!passwordHash) return false;
    return bcrypt.compare(String(password), passwordHash);
};

/**
 * SHA-256 хеш токена подтверждения почты.
 * @param {string} token
 * @returns {string}
 */
const hashConfirmToken = (token) => {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
};

/**
 * Удаляет просроченные записи из счётчика попыток входа.
 */
const pruneExpiredLoginAttempts = () => {
    const now = Date.now();
    for (const [key, entry] of loginAttempts.entries()) {
        if (entry.resetAt <= now) {
            loginAttempts.delete(key);
        }
    }
};

/**
 * Проверяет лимит неудачных попыток входа по почте (в памяти процесса).
 * @param {string} email
 * @returns {boolean} true если вход ещё разрешён
 */
const allowLoginAttempt = (email) => {
    pruneExpiredLoginAttempts();
    const key = normalizeEmail(email);
    const now = Date.now();
    const entry = loginAttempts.get(key);
    if (!entry || entry.resetAt <= now) {
        loginAttempts.set(key, { count: 0, resetAt: now + LOGIN_WINDOW_MS });
        return true;
    }
    return entry.count < LOGIN_MAX_ATTEMPTS;
};

/**
 * Регистрирует неудачную попытку входа.
 * @param {string} email
 */
const recordFailedLogin = (email) => {
    pruneExpiredLoginAttempts();
    const key = normalizeEmail(email);
    const now = Date.now();
    const entry = loginAttempts.get(key);
    if (!entry || entry.resetAt <= now) {
        loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
        return;
    }
    entry.count += 1;
};

/**
 * Сбрасывает счётчик после успешного входа.
 * @param {string} email
 */
const clearLoginAttempts = (email) => {
    loginAttempts.delete(normalizeEmail(email));
};

/**
 * Преобразует ошибку уникального индекса Mongo в 409.
 * @param {Error} err
 * @returns {Error}
 */
const mapDuplicateEmailError = (err) => {
    if (err && (err.code === 11000 || err.code === '11000')) {
        const mapped = new Error('Email already in use');
        mapped.status = 409;
        return mapped;
    }
    return err;
};

/**
 * Ищет пользователя, у которого занята эта почта (не тот же _id).
 * Учитывает подтверждённый emailLogin и pendingEmail.
 * @param {string} email
 * @param {import('mongoose').Types.ObjectId|string} [excludeUserId]
 * @returns {Promise<import('mongoose').Document|null>}
 */
const findUserByEmailLogin = async (email, excludeUserId = null) => {
    const normalized = normalizeEmail(email);
    const query = {
        $or: [
            { emailLogin: normalized },
            { pendingEmail: normalized },
            {
                identities: {
                    $elemMatch: { provider: 'email', providerUserId: normalized },
                },
            },
        ],
    };
    if (excludeUserId) {
        query._id = { $ne: excludeUserId };
    }
    return User.findOne(query).select('+pendingEmail');
};

/**
 * Загружает пользователя с полями пароля и подтверждения почты.
 * @param {import('mongoose').Types.ObjectId|string} userId
 * @returns {Promise<import('mongoose').Document|null>}
 */
const loadUserWithEmailSecrets = async (userId) => {
    return User.findById(userId).select(
        '+passwordHash +pendingEmail +pendingPasswordHash +emailConfirmTokenHash +emailConfirmExpires',
    );
};

/**
 * Очищает pending-поля подтверждения почты.
 * @param {import('mongoose').Document} user
 */
const clearPendingEmail = (user) => {
    user.pendingEmail = undefined;
    user.pendingPasswordHash = undefined;
    user.emailConfirmTokenHash = undefined;
    user.emailConfirmExpires = undefined;
};

/**
 * Сохраняет pending-данные и отправляет письмо со ссылкой подтверждения.
 * @param {object} options
 * @param {import('mongoose').Document} options.user
 * @param {string} options.email
 * @param {string} options.passwordHash
 * @param {string} options.webAppBaseUrl
 * @param {Function} options.sendMail
 * @returns {Promise<{ user: import('mongoose').Document, pendingConfirmation: true }>}
 */
const startEmailConfirmation = async ({
    user,
    email,
    passwordHash,
    webAppBaseUrl,
    sendMail,
}) => {
    if (typeof sendMail !== 'function') {
        const err = new Error('Email delivery is not configured');
        err.status = 503;
        throw err;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.pendingEmail = email;
    user.pendingPasswordHash = passwordHash;
    user.emailConfirmTokenHash = hashConfirmToken(rawToken);
    user.emailConfirmExpires = new Date(Date.now() + EMAIL_CONFIRM_TTL_MS);

    try {
        await user.save();
    } catch (err) {
        throw mapDuplicateEmailError(err);
    }

    const base = String(webAppBaseUrl || '').replace(/\/$/, '');
    const confirmUrl = `${base}/app?emailConfirm=${encodeURIComponent(rawToken)}`;

    await sendMail({
        to: email,
        subject: 'Подтверждение почты — Tuleneva',
        text: `Перейдите по ссылке, чтобы подтвердить почту для входа:\n\n${confirmUrl}\n\nСсылка действует 24 часа.`,
        html: `<p>Перейдите по ссылке, чтобы подтвердить почту для входа:</p><p><a href="${confirmUrl}">${confirmUrl}</a></p><p>Ссылка действует 24 часа.</p>`,
    });

    return { user, pendingConfirmation: true };
};

/**
 * Привязывает или обновляет почту и пароль (с подтверждением по письму).
 * Смена только пароля на той же подтверждённой почте применяется сразу.
 * @param {import('mongoose').Document} user - Документ User (можно без passwordHash)
 * @param {string} email
 * @param {string} password
 * @param {object} [options]
 * @param {string} [options.currentPassword] - Обязателен, если у пользователя уже есть passwordHash
 * @param {boolean} [options.skipCurrentPassword=false] - Админская установка
 * @param {string} options.webAppBaseUrl
 * @param {Function} options.sendMail
 * @returns {Promise<{ user: import('mongoose').Document, pendingConfirmation: boolean }>}
 */
const linkEmailCredentials = async (user, email, password, options = {}) => {
    const {
        currentPassword,
        skipCurrentPassword = false,
        webAppBaseUrl,
        sendMail,
    } = options;

    const normalized = validateEmailCredentials(email, password);
    const fullUser = await loadUserWithEmailSecrets(user._id);
    if (!fullUser) {
        const err = new Error('User not found');
        err.status = 404;
        throw err;
    }

    if (fullUser.passwordHash && !skipCurrentPassword) {
        if (!currentPassword) {
            const err = new Error('Current password is required');
            err.status = 400;
            throw err;
        }
        const ok = await verifyPassword(currentPassword, fullUser.passwordHash);
        if (!ok) {
            const err = new Error('Current password is incorrect');
            err.status = 400;
            throw err;
        }
    }

    const conflict = await findUserByEmailLogin(normalized, fullUser._id);
    if (conflict) {
        const err = new Error('Email already in use');
        err.status = 409;
        throw err;
    }

    const newHash = await hashPassword(password);
    const sameConfirmedEmail =
        fullUser.emailLogin && fullUser.emailLogin === normalized;

    if (sameConfirmedEmail) {
        fullUser.passwordHash = newHash;
        clearPendingEmail(fullUser);
        try {
            await fullUser.save();
        } catch (err) {
            throw mapDuplicateEmailError(err);
        }
        return { user: fullUser, pendingConfirmation: false };
    }

    return startEmailConfirmation({
        user: fullUser,
        email: normalized,
        passwordHash: newHash,
        webAppBaseUrl,
        sendMail,
    });
};

/**
 * Подтверждает почту по одноразовому токену из письма.
 * @param {string} rawToken
 * @returns {Promise<import('mongoose').Document>}
 */
const confirmEmailToken = async (rawToken) => {
    const token = String(rawToken || '').trim();
    if (!token) {
        const err = new Error('Invalid or expired confirmation token');
        err.status = 400;
        throw err;
    }

    const tokenHash = hashConfirmToken(token);
    const user = await User.findOne({
        emailConfirmTokenHash: tokenHash,
        emailConfirmExpires: { $gt: new Date() },
    }).select(
        '+passwordHash +pendingEmail +pendingPasswordHash +emailConfirmTokenHash +emailConfirmExpires',
    );

    if (!user || !user.pendingEmail || !user.pendingPasswordHash) {
        const err = new Error('Invalid or expired confirmation token');
        err.status = 400;
        throw err;
    }

    const previousEmail = user.emailLogin;
    if (previousEmail && previousEmail !== user.pendingEmail && user.identities?.length) {
        user.identities = user.identities.filter(
            (i) => !(i.provider === 'email' && i.providerUserId === previousEmail),
        );
    }

    user.emailLogin = user.pendingEmail;
    user.passwordHash = user.pendingPasswordHash;
    ensureIdentity(user, {
        provider: 'email',
        providerUserId: user.pendingEmail,
        email: user.pendingEmail,
        verifiedAt: new Date(),
    });
    clearPendingEmail(user);

    try {
        await user.save();
    } catch (err) {
        throw mapDuplicateEmailError(err);
    }

    return user;
};

/**
 * Находит пользователя по подтверждённой почте с passwordHash и проверяет пароль.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('mongoose').Document|null>}
 */
const authenticateEmailPassword = async (email, password) => {
    const normalized = normalizeEmail(email);
    if (!normalized || !password) {
        return null;
    }

    if (!allowLoginAttempt(normalized)) {
        const err = new Error('Too many login attempts. Try again later.');
        err.status = 429;
        throw err;
    }

    let user = await User.findOne({ emailLogin: normalized }).select('+passwordHash');
    if (!user) {
        user = await findUserByIdentity('email', normalized);
        if (user) {
            user = await User.findById(user._id).select('+passwordHash +emailLogin');
            if (user && user.emailLogin !== normalized) {
                user = null;
            }
        }
    }

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
        recordFailedLogin(normalized);
        return null;
    }

    clearLoginAttempts(normalized);
    return user;
};

/**
 * Сбрасывает счётчики (для тестов).
 */
const resetLoginAttemptsForTests = () => {
    loginAttempts.clear();
};

/**
 * Запрашивает сброс пароля: всегда «успех» снаружи; письмо только при подтверждённой почте.
 * @param {string} email
 * @param {object} options
 * @param {string} options.webAppBaseUrl
 * @param {Function} options.sendMail
 * @returns {Promise<{ sent: boolean }>}
 */
const requestPasswordReset = async (email, options = {}) => {
    const { webAppBaseUrl, sendMail } = options;
    const normalized = normalizeEmail(email);
    if (!normalized) {
        return { sent: false };
    }

    const user = await User.findOne({ emailLogin: normalized }).select(
        '+passwordHash +passwordResetTokenHash +passwordResetExpires',
    );
    if (!user || !user.passwordHash) {
        return { sent: false };
    }
    if (typeof sendMail !== 'function') {
        return { sent: false };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetTokenHash = hashConfirmToken(rawToken);
    user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
    await user.save();

    const base = String(webAppBaseUrl || '').replace(/\/$/, '');
    const resetUrl = `${base}/app?passwordReset=${encodeURIComponent(rawToken)}`;

    await sendMail({
        to: normalized,
        subject: 'Сброс пароля — Tuleneva',
        text: `Перейдите по ссылке, чтобы задать новый пароль:\n\n${resetUrl}\n\nСсылка действует 1 час.`,
        html: `<p>Перейдите по ссылке, чтобы задать новый пароль:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Ссылка действует 1 час.</p>`,
    });

    return { sent: true };
};

/**
 * Задаёт новый пароль по токену из письма сброса.
 * @param {string} rawToken
 * @param {string} newPassword
 * @returns {Promise<import('mongoose').Document>}
 */
const resetPasswordWithToken = async (rawToken, newPassword) => {
    const token = String(rawToken || '').trim();
    if (!token) {
        const err = new Error('Invalid or expired reset token');
        err.status = 400;
        throw err;
    }
    if (!newPassword || String(newPassword).length < MIN_PASSWORD_LENGTH) {
        const err = new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        err.status = 400;
        throw err;
    }

    const tokenHash = hashConfirmToken(token);
    const user = await User.findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpires: { $gt: new Date() },
    }).select('+passwordHash +passwordResetTokenHash +passwordResetExpires');

    if (!user) {
        const err = new Error('Invalid or expired reset token');
        err.status = 400;
        throw err;
    }

    user.passwordHash = await hashPassword(newPassword);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    clearLoginAttempts(user.emailLogin);
    return user;
};

module.exports = {
    normalizeEmail,
    validateEmailCredentials,
    hashPassword,
    verifyPassword,
    linkEmailCredentials,
    confirmEmailToken,
    authenticateEmailPassword,
    requestPasswordReset,
    resetPasswordWithToken,
    findUserByEmailLogin,
    allowLoginAttempt,
    recordFailedLogin,
    clearLoginAttempts,
    resetLoginAttemptsForTests,
    mapDuplicateEmailError,
    MIN_PASSWORD_LENGTH,
    BCRYPT_ROUNDS,
    EMAIL_CONFIRM_TTL_MS,
    PASSWORD_RESET_TTL_MS,
};
