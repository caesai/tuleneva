const crypto = require('crypto');

/**
 * Парсит строку запроса init data Telegram.
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
 * Проверяет подпись Telegram Mini App init data.
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

/**
 * Извлекает и валидирует Telegram user из init data.
 */
const parseTelegramUser = (userDataRaw, botToken) => {
    if (!userDataRaw) {
        throw new Error('Missing Telegram initialization data');
    }
    if (!verifyTelegramInitData(userDataRaw, botToken)) {
        throw new Error('Invalid Telegram data signature');
    }
    const tg = parseQueryToNestedJson(userDataRaw);
    if (!tg.user?.id) {
        throw new Error('Invalid Telegram user payload');
    }
    return tg;
};

module.exports = {
    parseQueryToNestedJson,
    verifyTelegramInitData,
    parseTelegramUser,
};
