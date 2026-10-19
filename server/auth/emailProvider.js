const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { findUserByIdentity, ensureIdentity } = require('./identityService');

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

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
 * Проверяет лимит неудачных попыток входа по почте (в памяти процесса).
 * @param {string} email
 * @returns {boolean} true если вход ещё разрешён
 */
const allowLoginAttempt = (email) => {
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
 * Ищет пользователя, у которого занята эта почта (не тот же _id).
 * @param {string} email
 * @param {import('mongoose').Types.ObjectId|string} [excludeUserId]
 * @returns {Promise<import('mongoose').Document|null>}
 */
const findUserByEmailLogin = async (email, excludeUserId = null) => {
    const normalized = normalizeEmail(email);
    const query = {
        $or: [
            { emailLogin: normalized },
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
    return User.findOne(query);
};

/**
 * Привязывает или обновляет почту и пароль на существующем пользователе.
 * @param {import('mongoose').Document} user - Документ User (можно без passwordHash)
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('mongoose').Document>}
 */
const linkEmailCredentials = async (user, email, password) => {
    const normalized = validateEmailCredentials(email, password);

    const conflict = await findUserByEmailLogin(normalized, user._id);
    if (conflict) {
        const err = new Error('Email already in use');
        err.status = 409;
        throw err;
    }

    const previousEmail = user.emailLogin;
    if (previousEmail && previousEmail !== normalized && user.identities?.length) {
        user.identities = user.identities.filter(
            (i) => !(i.provider === 'email' && i.providerUserId === previousEmail),
        );
    }

    user.emailLogin = normalized;
    user.passwordHash = await hashPassword(password);
    ensureIdentity(user, {
        provider: 'email',
        providerUserId: normalized,
        email: normalized,
        verifiedAt: new Date(),
    });
    await user.save();
    return user;
};

/**
 * Находит пользователя по почте с passwordHash и проверяет пароль.
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
            user = await User.findById(user._id).select('+passwordHash');
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

module.exports = {
    normalizeEmail,
    validateEmailCredentials,
    hashPassword,
    verifyPassword,
    linkEmailCredentials,
    authenticateEmailPassword,
    findUserByEmailLogin,
    allowLoginAttempt,
    recordFailedLogin,
    clearLoginAttempts,
    resetLoginAttemptsForTests,
    MIN_PASSWORD_LENGTH,
    BCRYPT_ROUNDS,
};
