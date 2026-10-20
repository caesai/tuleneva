const crypto = require('crypto');
const User = require('../models/User');

/**
 * Нормализует профиль веб-инвайта из тела запроса.
 * Email из payload игнорируется при создании пользователя (нет доказательства владения).
 * @param {object} [web]
 * @returns {{ firstName: string, lastName: string|null, email: string|null }}
 */
const parseWebProfile = (web = {}) => {
    const firstName = String(web.firstName || web.first_name || '').trim();
    const lastName = String(web.lastName || web.last_name || '').trim() || null;
    const email = String(web.email || '').trim().toLowerCase() || null;

    if (!firstName) {
        throw new Error('First name is required');
    }

    return { firstName, lastName, email };
};

/**
 * Создаёт нового web-пользователя с уникальным UUID-identity.
 * Заявленный email не используется как ключ входа и не помечается verified.
 * @param {{ firstName: string, lastName: string|null }} profile
 * @param {{ role?: string }} [options]
 * @returns {Promise<import('mongoose').Document>}
 */
const createWebUser = async (profile, options = {}) => {
    const identity = {
        provider: 'web',
        providerUserId: crypto.randomUUID(),
    };

    const user = new User({
        first_name: profile.firstName,
        last_name: profile.lastName,
        username: null,
        role: options.role || 'guest',
        identities: [identity],
    });
    await user.save();
    return user;
};

module.exports = {
    parseWebProfile,
    createWebUser,
};
