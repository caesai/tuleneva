const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Создаёт middleware опциональной JWT-аутентификации для публичных эндпоинтов.
 * При валидном токене и существующем пользователе заполняет req.dbUser; иначе — без ошибки.
 *
 * @param {string} jwtSecret - Секрет для верификации JWT.
 * @returns {import('express').RequestHandler}
 */
const createOptionalAuth = (jwtSecret) => async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return next();
    }

    try {
        const payload = jwt.verify(token, jwtSecret);
        const user = await User.findById(payload.userId);
        if (user) {
            req.dbUser = user;
        }
    } catch {
        // Невалидный или просроченный токен — отдаём публичный ответ без 401.
    }

    return next();
};

module.exports = { createOptionalAuth };
