/**
 * @file Хук почтовой аутентификации вне сессионного AuthContext.
 */
import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth.ts';
import {
    loginWithEmail,
    linkEmailCredentials,
    confirmEmail,
    requestPasswordResetEmail,
    resetPasswordWithToken as resetPasswordApi,
    parseAuthResponse,
} from '@/api/auth.api.ts';

/**
 * Почтовые операции (вход, привязка, сброс) с применением сессии через `login`.
 * @returns Методы почтовой auth
 */
export const useEmailAuth = () => {
    const { login } = useAuth();

    /**
     * Сохраняет сессию; если API не вернул JWT — оставляет текущий из localStorage.
     */
    const applyEmailSession = useCallback(
        (data: {
            valid?: boolean;
            token?: string | null;
            user?: Parameters<typeof login>[0];
            authProvider?: Parameters<typeof login>[2];
        }) => {
            if (!data.valid || !data.user) {
                return;
            }
            const token =
                data.token !== undefined && data.token !== null
                    ? data.token
                    : localStorage.getItem('authToken');
            login(data.user, token, data.authProvider ?? 'email');
        },
        [login],
    );

    /**
     * Вход по почте и паролю (браузер).
     * @param email - Почта
     * @param password - Пароль
     */
    const loginWithEmailPassword = useCallback(
        async (email: string, password: string) => {
            const response = await loginWithEmail(email, password);
            const data = await parseAuthResponse(response);
            if (!response.ok || !data.valid || !data.user) {
                throw new Error(data.message || 'Неверный email или пароль');
            }
            if (!data.token) {
                throw new Error('Вход по почте доступен после одобрения');
            }
            applyEmailSession({ ...data, authProvider: 'email' });
        },
        [applyEmailSession],
    );

    /**
     * Привязка почты к текущей сессии.
     * @param email - Почта
     * @param password - Пароль
     * @param currentPassword - Текущий пароль при смене
     * @returns pendingConfirmation — нужно подтвердить ссылку из письма
     */
    const linkEmailPassword = useCallback(
        async (email: string, password: string, currentPassword?: string) => {
            const response = await linkEmailCredentials(email, password, currentPassword);
            const data = await parseAuthResponse(response);
            if (!response.ok || !data.valid) {
                throw new Error(data.message || 'Не удалось привязать почту');
            }
            if (data.pendingConfirmation) {
                return { pendingConfirmation: true as const };
            }
            if (data.user) {
                applyEmailSession({
                    ...data,
                    authProvider: data.authProvider ?? 'email',
                });
            }
            return { pendingConfirmation: false as const };
        },
        [applyEmailSession],
    );

    /**
     * Подтверждение почты по токену из письма.
     * @param token - Токен из query
     */
    const confirmEmailToken = useCallback(
        async (token: string) => {
            const response = await confirmEmail(token);
            const data = await parseAuthResponse(response);
            if (!response.ok || !data.valid || !data.user) {
                throw new Error(data.message || 'Не удалось подтвердить почту');
            }
            if (!data.token) {
                throw new Error('Вход по почте доступен после одобрения');
            }
            applyEmailSession({ ...data, authProvider: 'email' });
        },
        [applyEmailSession],
    );

    /**
     * Запрос письма со сбросом пароля.
     * @param email - Почта
     */
    const requestPasswordReset = useCallback(async (email: string) => {
        const response = await requestPasswordResetEmail(email);
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        if (!response.ok) {
            throw new Error(data.message || 'Не удалось отправить письмо');
        }
    }, []);

    /**
     * Новый пароль по токену из письма.
     * @param token - Токен сброса
     * @param password - Новый пароль
     */
    const resetPasswordWithToken = useCallback(
        async (token: string, password: string) => {
            const response = await resetPasswordApi(token, password);
            const data = await parseAuthResponse(response);
            if (!response.ok || !data.valid || !data.user) {
                throw new Error(data.message || 'Не удалось сбросить пароль');
            }
            if (!data.token) {
                throw new Error('Вход по почте доступен после одобрения');
            }
            applyEmailSession({ ...data, authProvider: 'email' });
        },
        [applyEmailSession],
    );

    return {
        loginWithEmailPassword,
        linkEmailPassword,
        confirmEmailToken,
        requestPasswordReset,
        resetPasswordWithToken,
    };
};
