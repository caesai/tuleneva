/**
 * Рабочие часы студии и правило «слот уже начался» (Europe/Moscow).
 */

/** @description Допустимые часы бронирования (начало слота). */
export const AVAILABLE_HOURS = Object.freeze([
    '12:00',
    '13:00',
    '14:00',
    '15:00',
    '16:00',
    '17:00',
    '18:00',
    '19:00',
    '20:00',
    '21:00',
    '22:00',
    '23:00',
] as const);

export const MOSCOW_TZ = 'Europe/Moscow';

/**
 * Проверяет, входит ли час в сетку студии.
 * @param hour Например "14:00"
 * @returns true, если час в AVAILABLE_HOURS
 */
export const isHourAllowed = (hour: string): boolean =>
    (AVAILABLE_HOURS as readonly string[]).includes(String(hour));

/**
 * Части даты/времени «сейчас» в часовом поясе Москвы.
 * @param now Опорный момент времени
 * @returns Год, месяц, день и час по Москве
 */
export const getMoscowNowParts = (
    now: Date = new Date(),
): { year: number; month: number; day: number; hour: number } => {
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
    ) as Record<string, string>;
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
    };
};

/**
 * Разбирает дату DD/MM/YYYY.
 * @param dateDdMmYyyy Дата в формате DD/MM/YYYY
 * @returns Части даты или null
 */
export const parseDdMmYyyy = (
    dateDdMmYyyy: string,
): { year: number; month: number; day: number } | null => {
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
 * Календарный день раньше сегодняшнего по Москве.
 * Та же граница, что у isSlotInPast: сутки студии, не локальные сутки браузера.
 * @param dateDdMmYyyy Дата DD/MM/YYYY
 * @param now Опорный момент времени
 * @returns true, если день уже прошёл в Москве; для неразборной даты — false
 */
export const isStudioDayBeforeToday = (
    dateDdMmYyyy: string,
    now: Date = new Date(),
): boolean => {
    const selected = parseDdMmYyyy(dateDdMmYyyy);
    if (!selected) {
        return false;
    }
    const today = getMoscowNowParts(now);
    const selectedKey = selected.year * 10000 + selected.month * 100 + selected.day;
    const todayKey = today.year * 10000 + today.month * 100 + today.day;
    return selectedKey < todayKey;
};

/**
 * Слот уже начался или прошёл в Москве (как на клиенте: currentHour >= slotHour).
 * @param dateDdMmYyyy Дата слота
 * @param hour Час "HH:00"
 * @param now Опорный момент времени
 * @returns true, если слот в прошлом
 */
export const isSlotInPast = (
    dateDdMmYyyy: string,
    hour: string,
    now: Date = new Date(),
): boolean => {
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
 * @param date Дата
 * @returns Строка DD/MM/YYYY
 */
export const formatDdMmYyyyMoscow = (date: Date): string => {
    const p = getMoscowNowParts(date);
    const dd = String(p.day).padStart(2, '0');
    const mm = String(p.month).padStart(2, '0');
    return `${dd}/${mm}/${p.year}`;
};

/**
 * Сдвигает календарный день в Москве на deltaDays и возвращает DD/MM/YYYY.
 * @param deltaDays Сдвиг в днях
 * @param now Опорный момент времени
 * @returns Дата DD/MM/YYYY
 */
export const addMoscowDaysDdMmYyyy = (deltaDays: number, now: Date = new Date()): string => {
    const p = getMoscowNowParts(now);
    const anchor = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0));
    anchor.setUTCDate(anchor.getUTCDate() + deltaDays);
    return formatDdMmYyyyMoscow(anchor);
};
