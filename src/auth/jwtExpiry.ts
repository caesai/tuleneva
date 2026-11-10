/**
 * @file Локальная проверка JWT до запроса `/api/auth/session`.
 * Подпись здесь не проверяется: цель — не слать заведомо мёртвый токен,
 * на который сервер раньше отвечал 403 и браузер рисовал ошибку в консоли.
 */

interface JwtPayloadClock {
    exp?: number;
}

/**
 * Декодирует payload JWT без проверки подписи.
 * @param token Строка из localStorage
 * @returns Payload или null, если это не JWT
 */
const readJwtPayload = (token: string): JwtPayloadClock | null => {
    const part = token.split('.')[1];
    if (!part) {
        return null;
    }
    try {
        const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        const json = atob(padded);
        const parsed = JSON.parse(json) as JwtPayloadClock;
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
};

/**
 * Токен нельзя отправлять: он не JWT или `exp` уже прошёл.
 * Запас 60 секунд, чтобы часы телефона чуть впереди сервера не сбрасывали живую сессию.
 * @param token Значение `authToken`
 * @param nowMs Текущее время, мс
 * @returns true, если запрос сессии с этим токеном бессмысленен
 */
export const isJwtUnusable = (token: string, nowMs = Date.now()): boolean => {
    const payload = readJwtPayload(token);
    if (!payload) {
        return true;
    }
    if (typeof payload.exp !== 'number') {
        return false;
    }
    return payload.exp * 1000 + 60_000 <= nowMs;
};

/**
 * Читает токен. Ошибка доступа к storage (webview ещё не открыл его) — как отсутствие токена.
 * @returns JWT или null
 */
export const readStoredToken = (): string | null => {
    try {
        return localStorage.getItem('authToken');
    } catch {
        return null;
    }
};

/**
 * Удаляет сохранённый JWT. Ошибку storage глотает: сессия и так недействительна.
 */
export const dropStoredToken = (): void => {
    try {
        localStorage.removeItem('authToken');
    } catch {
        // storage может быть закрыт на первом тике webview
    }
};
