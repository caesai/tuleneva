/**
 * Фильтрация персональных данных в слотах расписания (/api/hours, WebSocket).
 */

/**
 * Может ли зритель видеть имя, группу и аватар в слотах (аналог canViewUserDetails на клиенте).
 * @param {import('../models/User')|null|undefined} dbUser - Пользователь из БД после опциональной auth.
 * @returns {boolean}
 */
const canViewBookingUserDetails = (dbUser) => {
    if (!dbUser) {
        return false;
    }
    return dbUser.role !== 'guest';
};

/**
 * Возвращает слоты с PII или только публичные поля (час + тип репетиции).
 * @param {Array<object>} hours - Нормализованные слоты (bookedHourSchema).
 * @param {boolean} canViewDetails - Разрешён ли просмотр персональных данных.
 * @returns {Array<object>}
 */
const sanitizeHoursForViewer = (hours, canViewDetails) => {
    if (canViewDetails) {
        return hours;
    }

    return hours.map((slot) => {
        const entry = { hour: slot.hour };
        if (slot.rehearsalType) {
            entry.rehearsalType = slot.rehearsalType;
        }
        return entry;
    });
};

module.exports = {
    canViewBookingUserDetails,
    sanitizeHoursForViewer,
};
