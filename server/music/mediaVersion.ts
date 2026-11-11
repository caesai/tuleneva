/**
 * @file Номер байтов обложки или MP3.
 * Старый документ без поля остаётся на нуле и продолжает открываться.
 */

/**
 * Читает сохранённый номер. Нет поля, дробь или отрицательное — ноль.
 * @param value Поле документа
 * @returns Целое от нуля
 */
export const storedMediaVersion = (value: unknown): number => {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
        return value;
    }
    return 0;
};

/**
 * Следующий номер после записи новых байтов, даже если ключ и MIME те же.
 * @param value Текущее поле
 * @returns Номер на единицу больше
 */
export const bumpMediaVersion = (value: unknown): number => storedMediaVersion(value) + 1;
