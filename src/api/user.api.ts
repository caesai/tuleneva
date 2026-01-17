import { DEV_URL, USER_AUTH_URL, USER_INFO_URL, USERS_LIST_URL, getAuthHeaders } from '@/api/base.api.ts';

/**
 * Выполняет аутентификацию пользователя через Telegram Init Data.
 * @param initData - Данные запуска Telegram Mini App.
 * @param user - Строка с данными пользователя из Telegram.
 * @returns {Promise<Response>} Ответ сервера с токеном и данными пользователя.
 */
export const APIPostAuth = async (initData: object, user: string)=> {
    return await fetch(USER_AUTH_URL, {
        method: 'POST',
        body: JSON.stringify({
            initData,
            user
        }),
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache',
        },
    });
}

/**
 * Отправляет запрос на регистрацию пользователя (создание в БД).
 * @param initData - Данные запуска Telegram Mini App.
 * @param user - Строка с данными пользователя из Telegram.
 * @returns {Promise<Response>} Ответ сервера.
 */
export const APIRegisterUser = async (initData: object, user: string) => {
    return await fetch(DEV_URL + '/users/register', {
        method: 'POST',
        body: JSON.stringify({
            initData,
            user
        }),
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, no-cache',
        },
    });
}

/**
 * Получает список всех пользователей (только для админов).
 * @returns {Promise<Response>} Ответ сервера со списком пользователей.
 */
export const APIGetUsers = async () => {
    return await fetch(DEV_URL + USERS_LIST_URL, {
        method: 'GET',
        headers: getAuthHeaders(),
    })
}

/**
 * Обновляет роль пользователя (только для админов).
 * @param userId - ID пользователя.
 * @param role - Новая роль ('admin', 'user', 'guest').
 * @returns {Promise<Response>} Ответ сервера о результате обновления.
 */
export const APIUpdateUserRole = async (userId: string, role: string) => {
    return await fetch(`${DEV_URL + USERS_LIST_URL}/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
        headers: getAuthHeaders(),
    });
}

/**
 * Удаляет пользователя (только для админов).
 * @param userId - ID пользователя для удаления.
 * @returns {Promise<Response>} Ответ сервера о результате удаления.
 */
export const APIDeleteUser = async (userId: string) => {
    return await fetch(`${DEV_URL + USERS_LIST_URL}/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
    });
}

/**
 * Получает информацию о текущем авторизованном пользователе.
 * @returns {Promise<Response>} Ответ сервера с данными пользователя.
 */
export const APIGetUserInfo = async () => {
    return await fetch(DEV_URL + USER_INFO_URL, {
        method: 'GET',
        headers: getAuthHeaders(),
    })
}
