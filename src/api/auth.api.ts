import { DEV_URL, getAuthHeaders } from '@/api/base.api.ts';
import type {
    IAuthSessionResponse,
    IInviteUsePayload,
    ITelegramAuthPayload,
} from '@/types/auth.types.ts';

const AUTH_BASE = DEV_URL + '/auth';

const jsonHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache',
};

/**
 * Восстанавливает сессию по JWT из localStorage.
 */
export const getAuthSession = async (): Promise<Response> => {
    return fetch(`${AUTH_BASE}/session`, {
        method: 'GET',
        headers: getAuthHeaders(),
    });
};

/**
 * Вход через Telegram Mini App.
 */
export const loginWithTelegram = async (payload: ITelegramAuthPayload): Promise<Response> => {
    return fetch(`${AUTH_BASE}/providers/telegram/login`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: jsonHeaders,
    });
};

/**
 * Запрос доступа (регистрация) через Telegram.
 */
export const requestAccessWithTelegram = async (
    payload: ITelegramAuthPayload,
): Promise<Response> => {
    return fetch(`${AUTH_BASE}/providers/telegram/register`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: jsonHeaders,
    });
};

/**
 * Использование инвайт-кода с указанным провайдером.
 */
export const applyInviteWithProvider = async (
    payload: IInviteUsePayload,
): Promise<Response> => {
    return fetch(`${AUTH_BASE}/invite/use`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: jsonHeaders,
    });
};

/**
 * Вход по почте и паролю (браузер, тот же User._id что у Telegram).
 * @param email - Адрес почты
 * @param password - Пароль (мин. 8 символов)
 */
export const loginWithEmail = async (
    email: string,
    password: string,
): Promise<Response> => {
    return fetch(`${AUTH_BASE}/providers/email/login`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: jsonHeaders,
    });
};

/**
 * Привязка почты и пароля к текущей JWT-сессии.
 * @param email - Адрес почты
 * @param password - Пароль (мин. 8 символов)
 */
export const linkEmailCredentials = async (
    email: string,
    password: string,
): Promise<Response> => {
    return fetch(`${AUTH_BASE}/providers/email/link`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: getAuthHeaders(),
    });
};

export const parseAuthResponse = async (
    response: Response,
): Promise<IAuthSessionResponse> => {
    return response.json() as Promise<IAuthSessionResponse>;
};
