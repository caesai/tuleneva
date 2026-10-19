const crypto = require('crypto');

/** Максимальный возраст Telegram init data (секунды). */
const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Парсит строку запроса init data Telegram.
 * @param {string} queryString
 * @returns {object}
 */
const parseQueryToNestedJson = (queryString) => {
    const params = new URLSearchParams(queryString);
    const result = {};

    params.forEach((encodedValue, key) => {
        const value = decodeURIComponent(encodedValue);
        if (key === 'user') {
            try {
                result[key] = JSON.parse(value);
            } catch {
                result[key] = value;
            }
        } else {
            result[key] = value;
        }
    });

    return result;
};

/**
 * Сравнивает две hex-строки без раннего выхода по длине совпадения.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
const safeEqualHex = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Проверяет подпись Telegram Mini App init data.
 * @param {string} initDataRaw - Сырые query-параметры init data
 * @param {string} botToken - Токен бота
 * @returns {boolean}
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

    return safeEqualHex(calculatedHash, hash);
};

/**
 * Проверяет наличие и свежесть auth_date в init data.
 * @param {object} tg - Распарсенные поля init data
 * @throws {Error}
 */
const assertFreshAuthDate = (tg) => {
    const authDateRaw = tg.auth_date;
    if (authDateRaw == null || authDateRaw === '') {
        throw new Error('Missing Telegram auth_date');
    }
    const authDate = Number(authDateRaw);
    if (!Number.isFinite(authDate) || authDate <= 0) {
        throw new Error('Invalid Telegram auth_date');
    }
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (ageSeconds < 0 || ageSeconds > INIT_DATA_MAX_AGE_SECONDS) {
        throw new Error('Telegram init data expired');
    }
};

/**
 * Извлекает и валидирует Telegram user из init data.
 * @param {string} userDataRaw
 * @param {string} botToken
 * @returns {object}
 */
const parseTelegramUser = (userDataRaw, botToken) => {
    if (!userDataRaw) {
        throw new Error('Missing Telegram initialization data');
    }
    if (!verifyTelegramInitData(userDataRaw, botToken)) {
        throw new Error('Invalid Telegram data signature');
    }
    const tg = parseQueryToNestedJson(userDataRaw);
    assertFreshAuthDate(tg);
    if (!tg.user?.id) {
        throw new Error('Invalid Telegram user payload');
    }
    return tg;
};

module.exports = {
    parseQueryToNestedJson,
    verifyTelegramInitData,
    parseTelegramUser,
    assertFreshAuthDate,
    INIT_DATA_MAX_AGE_SECONDS,
};
