/**
 * JWT и публичное представление пользователя (без passwordHash).
 */

/**
 * Убирает чувствительные поля из объекта пользователя для API.
 * @param {object|import('mongoose').Document} user
 * @returns {object}
 */
const toPublicUser = (user) => {
    const userObj = user.toObject ? user.toObject() : { ...user };
    delete userObj.passwordHash;
    delete userObj.pendingEmail;
    delete userObj.pendingPasswordHash;
    delete userObj.emailConfirmTokenHash;
    delete userObj.emailConfirmExpires;
    delete userObj.passwordResetTokenHash;
    delete userObj.passwordResetExpires;
    return userObj;
};

/**
 * Подписывает JWT сессии (userId + role).
 * @param {object} user
 * @param {string} jwtSecret
 * @returns {string}
 */
const signAuthToken = (user, jwtSecret) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
        { userId: user._id, role: user.role },
        jwtSecret,
        { expiresIn: '1d' },
    );
};

/**
 * Собирает стандартный ответ auth (valid, token, authProvider, user).
 * @param {object} user
 * @param {string|null} token
 * @param {string|null} [authProvider]
 * @returns {object}
 */
const buildAuthResponse = (user, token, authProvider = null) => {
    const userObj = toPublicUser(user);
    return {
        valid: true,
        token: token ?? null,
        authProvider,
        user: {
            ...userObj,
            isRegistered: !!token || userObj.isRegistered === true,
        },
    };
};

module.exports = {
    toPublicUser,
    signAuthToken,
    buildAuthResponse,
};
