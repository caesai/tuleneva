const crypto = require('crypto');

/**
 * Builds valid Telegram Mini App init data string with HMAC hash.
 */
const buildInitData = (user, botToken, authDate = Math.floor(Date.now() / 1000)) => {
    const params = new URLSearchParams();
    params.set('user', JSON.stringify(user));
    params.set('auth_date', String(authDate));
    params.sort();

    const dataCheckString = Array.from(params.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    params.set('hash', hash);

    return params.toString();
};

module.exports = { buildInitData };
