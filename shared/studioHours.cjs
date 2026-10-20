/**
 * Рабочие часы студии и правило «слот уже начался» (Europe/Moscow).
 * CommonJS (.cjs): корневой package.json — "type": "module".
 */

/** @description Допустимые часы бронирования (начало слота). */
const AVAILABLE_HOURS = Object.freeze([
    '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
    '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
]);

const MOSCOW_TZ = 'Europe/Moscow';

/**
 * Проверяет, входит ли час в сетку студии.
 * @param {string} hour - Например "14:00"
 * @returns {boolean}
 */
const isHourAllowed = (hour) => AVAILABLE_HOURS.includes(String(hour));

/**
 * Части даты/времени «сейчас» в часовом поясе Москвы.
 * @param {Date} [now]
 * @returns {{ year: number, month: number, day: number, hour: number }}
 */
const getMoscowNowParts = (now = new Date()) => {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
            timeZone: MOSCOW_TZ,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        })
            .formatToParts(now)
            .filter((p) => p.type !== 'literal')
            .map((p) => [p.type, p.value]),
    );
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
    };
};

/**
 * Разбирает дату DD/MM/YYYY.
 * @param {string} dateDdMmYyyy
 * @returns {{ year: number, month: number, day: number }|null}
 */
const parseDdMmYyyy = (dateDdMmYyyy) => {
    const match = String(dateDdMmYyyy || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) {
        return null;
    }
    return {
        day: Number(match[1]),
        month: Number(match[2]),
        year: Number(match[3]),
    };
};

/**
 * Слот уже начался или прошёл в Москве (как на клиенте: currentHour >= slotHour).
 * @param {string} dateDdMmYyyy - Дата слота
 * @param {string} hour - Час "HH:00"
 * @param {Date} [now]
 * @returns {boolean}
 */
const isSlotInPast = (dateDdMmYyyy, hour, now = new Date()) => {
    const dateParts = parseDdMmYyyy(dateDdMmYyyy);
    if (!dateParts) {
        return true;
    }
    const hourNum = parseInt(String(hour).split(':')[0], 10);
    if (Number.isNaN(hourNum)) {
        return true;
    }

    const moscow = getMoscowNowParts(now);
    const dateKey = dateParts.year * 10000 + dateParts.month * 100 + dateParts.day;
    const nowKey = moscow.year * 10000 + moscow.month * 100 + moscow.day;

    if (dateKey < nowKey) {
        return true;
    }
    if (dateKey > nowKey) {
        return false;
    }
    return moscow.hour >= hourNum;
};

/**
 * Форматирует Date в DD/MM/YYYY по Москве.
 * @param {Date} date
 * @returns {string}
 */
const formatDdMmYyyyMoscow = (date) => {
    const p = getMoscowNowParts(date);
    const dd = String(p.day).padStart(2, '0');
    const mm = String(p.month).padStart(2, '0');
    return `${dd}/${mm}/${p.year}`;
};

/**
 * Сдвигает календарный день в Москве на deltaDays и возвращает DD/MM/YYYY.
 * @param {number} deltaDays
 * @param {Date} [now]
 * @returns {string}
 */
const addMoscowDaysDdMmYyyy = (deltaDays, now = new Date()) => {
    const p = getMoscowNowParts(now);
    const anchor = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0));
    anchor.setUTCDate(anchor.getUTCDate() + deltaDays);
    return formatDdMmYyyyMoscow(anchor);
};

module.exports = {
    AVAILABLE_HOURS,
    MOSCOW_TZ,
    isHourAllowed,
    isSlotInPast,
    parseDdMmYyyy,
    getMoscowNowParts,
    formatDdMmYyyyMoscow,
    addMoscowDaysDdMmYyyy,
};
