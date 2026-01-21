import type { TRehearsalType } from '@/types/timetable.types.ts';
import { BOOK_URL, CANCEL_URL, HOURS_URL, TIMETABLE_URL, getAuthHeaders } from './base.api.ts';

/**
 * Получает расписание (список дат с бронированиями) на указанную дату (месяц).
 * @param date - Дата в формате 'DD/MM/YYYY'.
 * @returns {Promise<Response>} Ответ сервера со списком дат.
 */
export const APIGetTimeTable = async (date: string) => {
    return await fetch(TIMETABLE_URL + '?date=' + date, {
        method: 'GET',
        headers: getAuthHeaders(),
    });
};

/**
 * Получает список забронированных часов на конкретную дату.
 * @param date - Дата в формате 'DD/MM/YYYY'.
 * @returns {Promise<Response>} Ответ сервера со списком часов.
 */
export const APIGetHours = async (date: string): Promise<Response> => {
    return await fetch(HOURS_URL + '?date=' + date, {
        method: 'GET',
        headers: getAuthHeaders(),
    });
};

/**
 * Бронирует репетицию.
 * @param date - Дата репетиции.
 * @param hours - Массив выбранных часов.
 * @param band_name - Название группы (опционально).
 * @returns {Promise<Response>} Ответ сервера о результате бронирования.
 */
export const APIPostBookRehearsal = async (date: string, hours: string[], band_name?: string, rehearsalType?: TRehearsalType) => {
    return await fetch(BOOK_URL, {
        method: 'POST',
        body: JSON.stringify({
            date,
            hours,
            band_name,
            rehearsalType,
        }),
        headers: getAuthHeaders(),
    });
};

/**
 * Отменяет бронирование репетиции.
 * @param date - Дата репетиции.
 * @param hours - Массив часов для отмены.
 * @returns {Promise<any>} Ответ сервера (JSON).
 * @throws {Error} Если бронирование не найдено или произошла ошибка сервера.
 */
export const APICancelBooking = async (date: string, hours: string[]) => {
    const response = await fetch(CANCEL_URL, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({
            date,
            hours,
        }),
    });

    if (response.status === 404) {
        throw new Error('Booking not found or already canceled.');
    }
    if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
    }

    return await response.json();
};
