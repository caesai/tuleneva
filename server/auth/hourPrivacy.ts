/**
 * Фильтрация персональных данных в слотах расписания (/api/hours, WebSocket).
 */
import type { UserDoc } from '../models/User';

/**
 * Может ли зритель видеть имя, группу и аватар в слотах (аналог canViewUserDetails на клиенте).
 * @param {Pick<UserDoc, 'role'>|null|undefined} dbUser - Пользователь из БД после опциональной auth.
 * @returns {boolean}
 */
const canViewBookingUserDetails = (dbUser: Pick<UserDoc, 'role'> | null | undefined): boolean => {
    if (!dbUser) {
        return false;
    }
    return dbUser.role !== 'guest';
};

/** Публичные поля слота: час и тип репетиции. */
interface PublicHour {
    hour?: string;
    rehearsalType?: string;
}

/**
 * Возвращает слоты с PII или только публичные поля (час + тип репетиции).
 * @param {Array<PublicHour>} hours - Нормализованные слоты (bookedHourSchema).
 * @param {boolean} canViewDetails - Разрешён ли просмотр персональных данных.
 * @returns {Array<PublicHour>}
 */
const sanitizeHoursForViewer = <T extends PublicHour>(
    hours: T[],
    canViewDetails: boolean,
): T[] | PublicHour[] => {
    if (canViewDetails) {
        return hours;
    }

    return hours.map((slot) => {
        const entry: PublicHour = { hour: slot.hour };
        if (slot.rehearsalType) {
            entry.rehearsalType = slot.rehearsalType;
        }
        return entry;
    });
};

export {
    canViewBookingUserDetails,
    sanitizeHoursForViewer,
};
