/**
 * @file Сырой Telegram init data для запросов календаря.
 * В localStorage не пишется и в лог не попадает.
 */

let telegramInitData: string | null = null;

/**
 * Запоминает init data текущей сессии Mini App.
 * @param value Сырая строка или null вне Telegram
 */
export const setTelegramInitData = (value: string | null): void => {
    telegramInitData = value && value.trim() ? value : null;
};

/**
 * @returns Init data, если Mini App его уже отдал
 */
export const getTelegramInitData = (): string | null => telegramInitData;

/**
 * Человек уже есть в коллекции users (у синтетического гостя нет _id).
 * @param user Объект сессии
 * @returns true, если сервер прислал документ
 */
export const isListedStudioUser = (user: { _id?: string } | null | undefined): boolean =>
    Boolean(user?._id);

/**
 * Календарь виден всем, пока стелс выключен, и только списку, когда включён.
 * @param stealthMode Флаг с GET /api/config
 * @param user Текущая сессия
 * @returns true, если можно рисовать календарь
 */
export const canSeeStudioCalendar = (
    stealthMode: boolean,
    user: { _id?: string } | null | undefined,
): boolean => !stealthMode || isListedStudioUser(user);
