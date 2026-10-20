/**
 * Чистые тексты ответов бота по расписанию (без сети и Telegraf).
 */

const {
    AVAILABLE_HOURS,
    formatDdMmYyyyMoscow,
    addMoscowDaysDdMmYyyy,
} = require('../../shared/studioHours.cjs');

/**
 * Нормализует слот к { hour, username, band_name }.
 * @param {object} slot
 * @returns {{ hour: string, label: string }}
 */
const slotLabel = (slot) => {
    const name = (slot.username || '').trim() || 'Без имени';
    const band = (slot.band_name || '').trim();
    const label = band ? `${name} (${band})` : name;
    return { hour: slot.hour, label };
};

/**
 * Текст занятости на день.
 * @param {string} dateDdMmYyyy
 * @param {Array<object>} hours - Слоты из Rehearsal.hours
 * @param {string} [title] - Заголовок («Сегодня», «Завтра»)
 * @returns {string}
 */
const formatDayBookings = (dateDdMmYyyy, hours, title = 'Расписание') => {
    const booked = [...(hours || [])]
        .filter((h) => h && h.hour)
        .sort((a, b) => String(a.hour).localeCompare(String(b.hour)));

    if (booked.length === 0) {
        return `${title} (${dateDdMmYyyy})\nСвободно весь день (12:00–23:00).`;
    }

    const lines = booked.map((slot) => {
        const { hour, label } = slotLabel(slot);
        return `${hour} — ${label}`;
    });
    return `${title} (${dateDdMmYyyy})\n${lines.join('\n')}`;
};

/**
 * Текст свободных слотов на день.
 * @param {string} dateDdMmYyyy
 * @param {Array<object>} hours
 * @returns {string}
 */
const formatFreeSlots = (dateDdMmYyyy, hours) => {
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
const formatMyBookings = (rehearsals, userId, limit = 10) => {
    const uid = String(userId);
    const rows = [];

    for (const doc of rehearsals || []) {
        const dateStr = typeof doc.date === 'string'
            ? doc.date
            : formatDdMmYyyyMoscow(new Date(doc.date));
        const mine = (doc.hours || []).filter((h) => String(h.userId) === uid);
        for (const slot of mine) {
            rows.push({ dateStr, hour: slot.hour, band: (slot.band_name || '').trim() });
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
const moscowTodayTomorrow = (now = new Date()) => ({
    today: addMoscowDaysDdMmYyyy(0, now),
    tomorrow: addMoscowDaysDdMmYyyy(1, now),
});

module.exports = {
    formatDayBookings,
    formatFreeSlots,
    formatMyBookings,
    moscowTodayTomorrow,
    slotLabel,
};
