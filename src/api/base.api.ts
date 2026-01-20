/**
 * Базовый URL для всех API запросов.
 */
export const DEV_URL = '/api';

/**
 * Получает WebSocket URL на основе текущего протокола и хоста.
 * Автоматически определяет ws:// для http:// и wss:// для https://
 * Использует путь /ws для избежания конфликтов с Vite HMR.
 * @returns {string} WebSocket URL
 */
export const getWebSocketUrl = (): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
};

/**
 * URL для получения расписания (занятых дат).
 */
export const TIMETABLE_URL = DEV_URL + '/timetable';

/**
 * URL для получения забронированных часов на конкретную дату.
 */
export const HOURS_URL = DEV_URL + '/hours';

/**
 * URL для создания бронирования репетиции.
 */
export const BOOK_URL = DEV_URL + '/book';

/**
 * URL для отмены бронирования репетиции.
 */
export const CANCEL_URL = DEV_URL + '/cancel';

/**
 * URL для авторизации пользователя.
 */
export const USER_AUTH_URL = DEV_URL + '/users/auth';

/**
 * URL для работы со списком пользователей (получение, обновление роли, удаление).
 * Используется с префиксом DEV_URL.
 */
export const USERS_LIST_URL = '/users';

/**
 * URL для получения информации о текущем пользователе.
 * Используется с префиксом DEV_URL.
 */
export const USER_INFO_URL = '/users/info';

/**
 * Формирует заголовки для API запросов, включая токен авторизации.
 * @returns {HeadersInit} Объект заголовков с Content-Type и Authorization (если есть токен).
 */
export const getAuthHeaders = () => {
    const token = localStorage.getItem('authToken');
    return {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, no-cache',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
};
