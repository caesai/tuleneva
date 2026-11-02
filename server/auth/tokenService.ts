/**
 * JWT и публичное представление пользователя (без passwordHash).
 */
import jwt from 'jsonwebtoken';

/**
 * Убирает чувствительные поля из объекта пользователя для API.
 * @param user Документ или plain-объект пользователя
 * @returns Публичное представление без секретов
 */
const toPublicUser = (user: any): any => {
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
 * @param user Пользователь с _id и role
 * @param jwtSecret Секрет подписи
 * @returns JWT-строка
 */
const signAuthToken = (user: any, jwtSecret: string): string => {
    return jwt.sign(
        { userId: user._id, role: user.role },
        jwtSecret,
        { expiresIn: '1d' },
    );
};

/**
 * Собирает стандартный ответ auth (valid, token, authProvider, user).
 * @param user Пользователь
 * @param token JWT или null
 * @param authProvider Провайдер входа
 * @returns Тело auth-ответа
 */
const buildAuthResponse = (user: any, token: string | null, authProvider: string | null = null) => {
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

export {
    toPublicUser,
    signAuthToken,
    buildAuthResponse,
};
