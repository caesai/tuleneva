/**
 * @file Один повтор запроса, если сервер ответил 401 или 403.
 * Админка иногда успевает спросить данные в тот же момент, когда сессия
 * только что записала токен, и первый ответ приходит без прав.
 */

/**
 * Выполняет запрос и, только при 401/403, повторяет его один раз.
 * @param request Функция запроса. Должна читать токен заново на каждый вызов.
 * @returns Последний ответ
 */
export const retryOnceIfUnauthorized = async (
    request: () => Promise<Response>,
): Promise<Response> => {
    const first = await request();
    if (first.status !== 401 && first.status !== 403) {
        return first;
    }
    return request();
};
