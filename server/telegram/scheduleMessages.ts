/**
 * Чистые тексты ответов бота по расписанию (без сети и Telegraf).
 */

import {
    AVAILABLE_HOURS,
    formatDdMmYyyyMoscow,
    addMoscowDaysDdMmYyyy,
} from '../../shared/studioHours';

/**
 * Число часа из строки «HH:00».
 * @param {string} hour
 * @returns {number}
 */
const getHourNumber = (hour: string): number => parseInt(String(hour).split(':')[0], 10);

/**
 * Конец слота: следующий час. «23:00» → «00:00», как на карточке.
 * @param {string} hour
 * @returns {string}
 */
const calculateEndTime = (hour: string): string => {
    const nextHour = (getHourNumber(hour) + 1) % 24;
    return `${String(nextHour).padStart(2, '0')}:00`;
};

/** Слот расписания. Текстам бота нужен час «HH:00». */
interface HourSlot {
    hour: string;
}

/**
 * Соседние часы подряд, без учёта того, кто бронировал.
 * @param {HourSlot} previous
 * @param {HourSlot} current
 * @returns {boolean}
 */
const isNextHour = (previous: HourSlot, current: HourSlot): boolean =>
    getHourNumber(current.hour) === getHourNumber(previous.hour) + 1;

/**
 * Склеивает подряд идущие занятые часы в интервалы.
 * «14:00»+«15:00»+«16:00» → «14:00 - 17:00». Имя и коллектив не участвуют.
 * @param {Array<Partial<HourSlot> | null | undefined>} hours
 * @returns {Array<{ range: string }>}
 */
const groupBookedHours = (hours: Array<Partial<HourSlot> | null | undefined>): Array<{ range: string; }> => {
    const sorted = [...(hours || [])]
        .filter((slot): slot is HourSlot => Boolean(slot && slot.hour))
        .sort((a, b) => getHourNumber(a.hour) - getHourNumber(b.hour));

    if (sorted.length === 0) {
        return [];
    }

    const groups: Array<typeof sorted> = [];
    let current: typeof sorted = [sorted[0]];

    for (let i = 1; i < sorted.length; i += 1) {
        if (isNextHour(sorted[i - 1], sorted[i])) {
            current.push(sorted[i]);
        } else {
            groups.push(current);
            current = [sorted[i]];
        }
    }
    groups.push(current);

    return groups.map((group) => {
        const first = group[0];
        const last = group[group.length - 1];
        return {
            range: `${first.hour} - ${calculateEndTime(last.hour)}`,
        };
    });
};

/**
 * Занятость дня для общего чата: только интервалы, без того, кто забронировал.
 * @param {string} dateDdMmYyyy
 * @param {Array<Partial<HourSlot> | null | undefined>} hours - Слоты из Rehearsal.hours
 * @param {string} [title] - Заголовок («Сегодня», «Завтра»)
 * @returns {string}
 */
const formatDayBookings = <T extends Partial<HourSlot>>(
    dateDdMmYyyy: string,
    hours: Array<T | null | undefined>,
    title: string = 'Расписание',
): string => {
    const groups = groupBookedHours(hours);

    if (groups.length === 0) {
        return `${title} (${dateDdMmYyyy})\nСвободно весь день (12:00–23:00).`;
    }

    const lines = groups.map((group) => `${group.range} — занято`);
    return `${title} (${dateDdMmYyyy})\n${lines.join('\n')}`;
};

/**
 * Текст свободных слотов на день.
 * @param {string} dateDdMmYyyy
 * @param {Array<Partial<HourSlot>>} hours
 * @returns {string}
 */
const formatFreeSlots = <T extends Partial<HourSlot>>(
    dateDdMmYyyy: string,
    hours: Array<T>,
): string => {
    const taken = new Set((hours || []).map((h) => h.hour));
    const free = AVAILABLE_HOURS.filter((h) => !taken.has(h));
    if (free.length === 0) {
        return `Свободные слоты (${dateDdMmYyyy})\nВсе часы заняты.`;
    }
    return `Свободные слоты (${dateDdMmYyyy})\n${free.join(', ')}`;
};

/**
 * Ближайшие брони пользователя.
 * @param {Array<{ date: Date|string, hours: Array<object> }>} rehearsals
 * @param {string} userId
 * @param {number} [limit=10]
 * @returns {string}
 */
const formatMyBookings = (
    rehearsals: Array<{
        date: Date | string;
        hours?: Array<{ userId?: string; hour?: string; band_name?: string }>;
    }>,
    userId: string,
    limit: number = 10,
): string => {
    const uid = String(userId);
    const rows: Array<{ dateStr: string; hour: string; band: string }> = [];

    for (const doc of rehearsals || []) {
        const dateStr = typeof doc.date === 'string'
            ? doc.date
            : formatDdMmYyyyMoscow(new Date(doc.date));
        const mine = (doc.hours || []).filter((h) => String(h.userId) === uid);
        for (const slot of mine) {
            if (!slot.hour) continue;
            rows.push({
                dateStr,
                hour: slot.hour,
                band: (slot.band_name || '').trim(),
            });
        }
    }

    rows.sort((a, b) => {
        const [ad, am, ay] = a.dateStr.split('/').map(Number);
        const [bd, bm, by] = b.dateStr.split('/').map(Number);
        const ak = ay * 1000000 + am * 10000 + ad * 100 + parseInt(a.hour, 10);
        const bk = by * 1000000 + bm * 10000 + bd * 100 + parseInt(b.hour, 10);
        return ak - bk;
    });

    const slice = rows.slice(0, limit);
    if (slice.length === 0) {
        return 'У вас нет предстоящих бронирований.';
    }

    const lines = slice.map((r) => {
        const band = r.band ? ` (${r.band})` : '';
        return `${r.dateStr} ${r.hour}${band}`;
    });
    return `Ваши брони:\n${lines.join('\n')}`;
};

/**
 * Даты «сегодня» / «завтра» в Москве.
 * @param {Date} [now]
 * @returns {{ today: string, tomorrow: string }}
 */
const moscowTodayTomorrow = (now: Date = new Date()): { today: string; tomorrow: string; } => ({
    today: addMoscowDaysDdMmYyyy(0, now),
    tomorrow: addMoscowDaysDdMmYyyy(1, now),
});

export {
    formatDayBookings,
    formatFreeSlots,
    formatMyBookings,
    moscowTodayTomorrow,
    groupBookedHours,
};
