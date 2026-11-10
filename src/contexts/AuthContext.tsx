import React, { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import type { IUser } from '@/types/user.types.ts';
import type { IWebInviteProfile, TAuthProvider } from '@/types/auth.types.ts';
import {
    buildAuthCapabilities,
    resolveAuthStatus,
} from '@/types/auth.types.ts';
import {
    getAuthSession,
    loginWithTelegram,
    requestAccessWithTelegram,
    applyInviteWithProvider,
    parseAuthResponse,
} from '@/api/auth.api.ts';
import { buildTelegramAuthPayload } from '@/auth/telegramAuth.ts';
import { dropStoredToken, isJwtUnusable, readStoredToken } from '@/auth/jwtExpiry.ts';
import { getTelegramEnvironment } from '@/telegram/env.ts';
import {
    useSafeLaunchParams,
    useSafeRawInitData,
    readTelegramStartParam,
} from '@/telegram/useSafeLaunchParams.ts';
import { readTelegramLoginPayload } from '@/telegram/waitForTelegramLaunch.ts';
import { setTelegramInitData } from '@/auth/calendarAuth.ts';
import { AuthContext } from './AuthContextDefinition.ts';

interface AuthContextProps {
    children: ReactNode;
}

/**
 * Провайдер сессии: JWT, Telegram login/register, инвайт. Почта — {@link useEmailAuth}.
 * Не снимает лоадер, пока не прочитан токен. На телефоне и в Mini App одна
 * повторная попытка дождаться init data, если первая проба сессии пустая.
 * Просроченный JWT на сервер не отправляется.
 */
export const AuthProvider: React.FC<AuthContextProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<IUser | null>(null);
    const [authProvider, setAuthProvider] = useState<TAuthProvider | null>(null);

    const { launchParams: lp, isTelegram } = useSafeLaunchParams();
    const rawLp = useSafeRawInitData();
    const [telegramEpoch, setTelegramEpoch] = useState(0);
    const [lateTelegram, setLateTelegram] = useState<{
        launchParams: object;
        rawInitData: string;
    } | null>(null);
    const launchParams = lateTelegram?.launchParams ?? lp;
    const rawInitData = lateTelegram?.rawInitData ?? rawLp;
    const hookInTelegram = Boolean(isTelegram && getTelegramEnvironment());
    const isInTelegram = hookInTelegram || telegramEpoch > 0;
    const telegramStartParam = useMemo(
        () => (launchParams ? readTelegramStartParam(launchParams) : null),
        [launchParams],
    );

    useEffect(() => {
        setTelegramInitData(rawInitData || null);
    }, [rawInitData]);

    const login = useCallback((
        userData: IUser,
        token: string | null,
        provider: TAuthProvider | null = null,
    ) => {
        if (token) {
            localStorage.setItem('authToken', token);
            setIsAuthenticated(true);
        } else {
            localStorage.removeItem('authToken');
            setIsAuthenticated(false);
        }
        setUser(userData);
        setAuthProvider(provider);
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('authToken');
        setIsAuthenticated(false);
        setUser(null);
        setAuthProvider(null);
    }, []);

    const applySession = useCallback((data: {
        valid?: boolean;
        token?: string | null;
        user?: IUser;
        authProvider?: TAuthProvider | null;
    }) => {
        if (data.valid && data.user) {
            login(data.user, data.token ?? null, data.authProvider ?? null);
        } else {
            logout();
        }
    }, [login, logout]);

    useEffect(() => {
        let cancelled = false;

        /**
         * Один запрос сессии. 401/403 и `{ valid: false }` — тихий промах, не ошибка.
         * Сеть — отдельный исход, чтобы не стирать ещё годный токен.
         */
        const fetchSessionOnce = async (): Promise<
            | { kind: 'session'; data: Awaited<ReturnType<typeof parseAuthResponse>> }
            | { kind: 'invalid' }
            | { kind: 'network' }
        > => {
            try {
                const sessionRes = await getAuthSession();
                if (!sessionRes.ok) {
                    return { kind: 'invalid' };
                }
                const data = await parseAuthResponse(sessionRes);
                if (!data.valid || !data.user) {
                    return { kind: 'invalid' };
                }
                return { kind: 'session', data };
            } catch {
                return { kind: 'network' };
            }
        };

        /**
         * Одна попытка восстановить сессию. Просроченный JWT на сервер не уходит.
         * Повтор — снаружи, после того как webview успевает отдать storage или init data.
         */
        const restoreStoredSession = async (token: string | null) => {
            if (!token || isJwtUnusable(token)) {
                return {
                    data: null as Awaited<ReturnType<typeof parseAuthResponse>> | null,
                    dropToken: Boolean(token),
                    network: false,
                };
            }
            const result = await fetchSessionOnce();
            if (result.kind === 'session') {
                return { data: result.data, dropToken: false, network: false };
            }
            if (result.kind === 'network') {
                return { data: null, dropToken: false, network: true };
            }
            return { data: null, dropToken: true, network: false };
        };

        const initAuth = async () => {
            setIsLoading(true);
            try {
                let token = readStoredToken();
                let restored = await restoreStoredSession(token);
                if (cancelled) {
                    return;
                }

                const immediate = rawLp
                    ? { launchParams: lp, rawInitData: rawLp }
                    : null;
                let telegram = immediate
                    ? await readTelegramLoginPayload(immediate)
                    : null;

                if (!restored.data && !telegram) {
                    telegram = await readTelegramLoginPayload(null);
                    if (cancelled) {
                        return;
                    }
                    if (!token || restored.network) {
                        const again = readStoredToken();
                        if (again && (again !== token || restored.network)) {
                            token = again;
                            restored = await restoreStoredSession(token);
                        }
                    }
                }

                if (cancelled) {
                    return;
                }
                if (restored.dropToken) {
                    dropStoredToken();
                }
                if (restored.data) {
                    applySession(restored.data);
                    return;
                }
                if (telegram) {
                    if (telegram.discoveredLate) {
                        setLateTelegram({
                            launchParams: telegram.payload.initData,
                            rawInitData: telegram.payload.user,
                        });
                        setTelegramEpoch((value) => value + 1);
                    }
                    try {
                        const response = await loginWithTelegram(telegram.payload);
                        if (cancelled) {
                            return;
                        }
                        if (!response.ok) {
                            logout();
                            return;
                        }
                        const data = await parseAuthResponse(response);
                        applySession({ ...data, authProvider: 'telegram' });
                    } catch (error) {
                        console.error('Telegram auth failed:', error);
                        if (!cancelled) {
                            logout();
                        }
                    }
                    return;
                }
                if (restored.dropToken) {
                    logout();
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                }
            }
        };

        void initAuth();
        return () => {
            cancelled = true;
        };
    }, [lp, rawLp, applySession, logout]);

    const register = async () => {
        if (!isInTelegram || !launchParams || !rawInitData) {
            throw new Error('Registration is only available in Telegram Mini App');
        }
        const payload = buildTelegramAuthPayload(launchParams, rawInitData);
        const response = await requestAccessWithTelegram(payload);
        const data = await parseAuthResponse(response);
        if (data.valid && data.user) {
            applySession({ ...data, authProvider: 'telegram' });
        } else {
            throw new Error('Registration failed');
        }
    };

    /**
     * Регистрация по инвайту (Telegram init data или веб-профиль без email).
     * @param code - Код инвайта
     * @param webProfile - Имя/фамилия для веб-регистрации вне Telegram
     */
    const registerWithInvite = async (code: string, webProfile?: IWebInviteProfile) => {
        if (isInTelegram && launchParams && rawInitData) {
            const response = await applyInviteWithProvider({
                code,
                provider: 'telegram',
                telegram: {
                    initData: launchParams,
                    user: rawInitData,
                },
            });
            const data = await parseAuthResponse(response);
            if (data.valid && data.user) {
                applySession({ ...data, authProvider: 'telegram' });
                return;
            }
            throw new Error('Invite registration failed');
        }

        if (!webProfile?.firstName?.trim()) {
            throw new Error('First name is required for web invite registration');
        }

        const response = await applyInviteWithProvider({
            code,
            provider: 'web',
            web: {
                firstName: webProfile.firstName.trim(),
                lastName: webProfile.lastName?.trim() || undefined,
            },
        });
        const data = await parseAuthResponse(response);
        if (data.valid && data.user) {
            applySession({ ...data, authProvider: 'web' });
            return;
        }
        throw new Error('Invite registration failed');
    };

    const capabilities = useMemo(
        () => buildAuthCapabilities(user, isAuthenticated),
        [user, isAuthenticated],
    );

    const authStatus = useMemo(
        () => resolveAuthStatus(isLoading, isAuthenticated, user),
        [isLoading, isAuthenticated, user],
    );

    return (
        <AuthContext.Provider
            value={{
                isAuthenticated,
                isLoading,
                authStatus,
                authProvider,
                user,
                capabilities,
                isInTelegram,
                telegramStartParam,
                login,
                logout,
                register,
                registerWithInvite,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
