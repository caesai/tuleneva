/**
 * @file Когда подпись записи не несёт смысла и её лучше не показывать.
 */

/**
 * Пустая строка и заглушка «Студия» не показываются под названием.
 * @param credits Подпись с сервера
 * @returns true, если строку надо скрыть
 */
export const isPlaceholderCredit = (credits: string | null | undefined): boolean => {
    const value = credits?.trim() ?? '';
    return value.length === 0 || value === 'Студия';
};
