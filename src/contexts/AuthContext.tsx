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
import { getTelegramEnvironment } from '@/telegram/env.ts';
import { useSafeLaunchParams, useSafeRawInitData } from '@/telegram/useSafeLaunchParams.ts';
import { AuthContext } from './AuthContextDefinition.ts';

interface AuthContextProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthContextProps> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<IUser | null>(null);
    const [authProvider, setAuthProvider] = useState<TAuthProvider | null>(null);

    const { launchParams: lp, isTelegram } = useSafeLaunchParams();
    const rawLp = useSafeRawInitData();
    const isInTelegram = isTelegram && getTelegramEnvironment();

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
        const initAuth = async () => {
            setIsLoading(true);

            const storedToken = localStorage.getItem('authToken');
            if (storedToken) {
                try {
                    const sessionRes = await getAuthSession();
                    if (sessionRes.ok) {
                        const sessionData = await parseAuthResponse(sessionRes);
                        applySession(sessionData);
                        setIsLoading(false);
                        return;
                    }
                    logout();
                } catch (error) {
                    console.error('Session restore failed:', error);
                    logout();
                }
            }

            if (isInTelegram && lp && rawLp) {
                try {
                    const payload = buildTelegramAuthPayload(lp, rawLp);
                    const response = await loginWithTelegram(payload);
                    const data = await parseAuthResponse(response);
                    applySession({ ...data, authProvider: 'telegram' });
                } catch (error) {
                    console.error('Telegram auth failed:', error);
                    logout();
                } finally {
                    setIsLoading(false);
                }
                return;
            }

            setIsLoading(false);
        };

        initAuth();
    }, [lp, rawLp, isInTelegram, applySession, logout]);

    const register = async () => {
        if (!isInTelegram || !lp || !rawLp) {
            throw new Error('Registration is only available in Telegram Mini App');
        }
        const payload = buildTelegramAuthPayload(lp, rawLp);
        const response = await requestAccessWithTelegram(payload);
        const data = await parseAuthResponse(response);
        if (data.valid && data.user) {
            applySession({ ...data, authProvider: 'telegram' });
        } else {
            throw new Error('Registration failed');
        }
    };

    const registerWithInvite = async (code: string, webProfile?: IWebInviteProfile) => {
        if (isInTelegram && lp && rawLp) {
            const response = await applyInviteWithProvider({
                code,
                provider: 'telegram',
                telegram: {
                    initData: lp,
                    user: rawLp,
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
                email: webProfile.email?.trim() || undefined,
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
