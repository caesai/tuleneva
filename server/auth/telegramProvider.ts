import crypto from 'crypto';
import type { TelegramProfile } from './identityService';

/** Поля init data после разбора query. Остальные ключи не используются логином. */
interface TelegramInitFields {
    auth_date?: string;
    user?: unknown;
    [key: string]: unknown;
}

/** Проверенные init data: свежий auth_date и профиль с id. */
interface ParsedTelegramInit {
    auth_date: string;
    user: TelegramProfile;
}

/** Максимальный возраст Telegram init data (секунды). */
const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

/** Допустимый рассинхрон часов: auth_date чуть в будущем (секунды). */
const INIT_DATA_CLOCK_SKEW_SECONDS = 60;

/**
 * Парсит строку запроса init data Telegram.
 * @param {string} queryString
 * @returns {TelegramInitFields}
 */
const parseQueryToNestedJson = (queryString: string): TelegramInitFields => {
    const params = new URLSearchParams(queryString);
    const result: TelegramInitFields = {};

    params.forEach((encodedValue, key) => {
        const value = decodeURIComponent(encodedValue);
        if (key === 'user') {
            try {
                result.user = JSON.parse(value) as unknown;
            } catch {
                result.user = value;
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
const safeEqualHex = (a: string, b: string): boolean => {
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
const verifyTelegramInitData = (initDataRaw: string, botToken: string): boolean => {
    const data = new URLSearchParams(initDataRaw);
    const hash = data.get('hash');
    data.delete('hash');
    data.sort();

    const dataCheckString = Array.from(data.entries())
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

    if (hash == null) return false;
    return safeEqualHex(calculatedHash, hash);
};

/**
 * Проверяет наличие и свежесть auth_date в init data.
 * @param {TelegramInitFields} tg - Распарсенные поля init data
 * @throws {Error}
 */
function assertFreshAuthDate(tg: TelegramInitFields): asserts tg is TelegramInitFields & { auth_date: string } {
    const authDateRaw = tg.auth_date;
    if (authDateRaw == null || authDateRaw === '') {
        throw new Error('Missing Telegram auth_date');
    }
    const authDate = Number(authDateRaw);
    if (!Number.isFinite(authDate) || authDate <= 0) {
        throw new Error('Invalid Telegram auth_date');
    }
    const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
    if (ageSeconds < -INIT_DATA_CLOCK_SKEW_SECONDS || ageSeconds > INIT_DATA_MAX_AGE_SECONDS) {
        throw new Error('Telegram init data expired');
    }
}

/**
 * Опциональное текстовое поле профиля. Чужой тип отбрасывается.
 * @param {unknown} value
 * @returns {string | null | undefined}
 */
const readOptionalText = (value: unknown): string | null | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    return typeof value === 'string' ? value : undefined;
};

/**
 * Собирает профиль Telegram из разобранного user.
 * Нет id или first_name — та же ошибка, что и у прежней проверки payload.
 * @param {unknown} value
 * @returns {TelegramProfile}
 */
const readTelegramProfile = (value: unknown): TelegramProfile => {
    if (!value || typeof value !== 'object') {
        throw new Error('Invalid Telegram user payload');
    }
    const record = value as Record<string, unknown>;
    const { id, first_name: firstName } = record;
    if ((typeof id !== 'number' && typeof id !== 'string') || !id || typeof firstName !== 'string') {
        throw new Error('Invalid Telegram user payload');
    }

    const profile: TelegramProfile = { id, first_name: firstName };
    const lastName = readOptionalText(record.last_name);
    const username = readOptionalText(record.username);
    const photoUrl = readOptionalText(record.photo_url);
    if (lastName !== undefined) profile.last_name = lastName;
    if (username !== undefined) profile.username = username;
    if (photoUrl !== undefined) profile.photo_url = photoUrl;
    return profile;
};

/**
 * Извлекает и валидирует Telegram user из init data.
 * @param {string} userDataRaw
 * @param {string} botToken
 * @returns {ParsedTelegramInit}
 */
const parseTelegramUser = (userDataRaw: string, botToken: string): ParsedTelegramInit => {
    if (!userDataRaw) {
        throw new Error('Missing Telegram initialization data');
    }
    if (!verifyTelegramInitData(userDataRaw, botToken)) {
        throw new Error('Invalid Telegram data signature');
    }
    const tg = parseQueryToNestedJson(userDataRaw);
    assertFreshAuthDate(tg);
    return {
        auth_date: tg.auth_date,
        user: readTelegramProfile(tg.user),
    };
};

export {
    parseQueryToNestedJson,
    verifyTelegramInitData,
    parseTelegramUser,
    assertFreshAuthDate,
    INIT_DATA_MAX_AGE_SECONDS,
    INIT_DATA_CLOCK_SKEW_SECONDS,
};
