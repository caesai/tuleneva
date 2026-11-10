/**
 * @file Флаг «стелс»: календарь только для людей, которые уже есть в users.
 * По умолчанию включён, чтобы деплой не требовал новой переменной.
 */

/**
 * STEALTH_MODE выключен только явными 0, false, off, no.
 * Пустое значение и отсутствие переменной — режим включён.
 * @returns true, если календарь закрыт для людей вне списка
 */
export const isStealthMode = (): boolean => {
    const raw = process.env.STEALTH_MODE;
    if (raw == null || raw.trim() === '') {
        return true;
    }
    return !['0', 'false', 'off', 'no'].includes(raw.trim().toLowerCase());
};
