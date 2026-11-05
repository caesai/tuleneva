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
 * Без валидного JWT участника в ответе только hour и rehearsalType; PII — с Bearer-токеном (role !== guest).
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
 * Разбирает отказ POST /api/book: часы, которые сервер не принял, и текст для тоста.
 * @param response Ответ с ok: false
 * @returns Сообщение и часы, которые нужно снять с выбора
 */
export const readBookFailure = async (response: Response): Promise<{
    message: string;
    rejectedHours: string[];
}> => {
    const body = await response.json().catch(() => null) as {
        pastHours?: unknown;
        invalidHours?: unknown;
        conflictingHours?: unknown;
    } | null;
    const rejectedHours = [body?.pastHours, body?.invalidHours, body?.conflictingHours]
        .flatMap((value) => (
            Array.isArray(value)
                ? value.filter((hour): hour is string => typeof hour === 'string')
                : []
        ));

    if (response.status === 409) {
        return { message: 'Это время уже занято.', rejectedHours };
    }
    if (Array.isArray(body?.pastHours) && body.pastHours.length > 0) {
        return { message: 'Нельзя бронировать прошедшее время.', rejectedHours };
    }
    if (Array.isArray(body?.invalidHours) && body.invalidHours.length > 0) {
        return { message: 'Эти часы вне расписания студии.', rejectedHours };
    }
    if (response.status === 403) {
        return { message: 'Бронирование недоступно.', rejectedHours };
    }
    return { message: 'Не удалось забронировать время.', rejectedHours };
};

/**
 * Бронирует репетицию.
 * @param date - Дата репетиции DD/MM/YYYY.
 * @param hours - Массив выбранных часов.
 * @param band_name - Название группы (опционально).
 * @param rehearsalType - Тип слота.
 * @returns Ответ POST /api/book. 201 — документ дня, 409 — conflictingHours.
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
 * Тело ответа разбирает страница: 409 значит, что слот уже изменился.
 * @param date - Дата репетиции DD/MM/YYYY.
 * @param hours - Массив часов для отмены.
 * @returns Ответ DELETE /api/cancel
 */
export const APICancelBooking = async (date: string, hours: string[]): Promise<Response> => {
    return await fetch(CANCEL_URL, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        body: JSON.stringify({
            date,
            hours,
        }),
    });
};
