import { createContext } from 'react';
import type { IUser } from '@/types/user.types.ts';
import type {
    IAuthCapabilities,
    IWebInviteProfile,
    TAuthProvider,
    TAuthStatus,
} from '@/types/auth.types.ts';
import { buildAuthCapabilities } from '@/types/auth.types.ts';

/**
 * Интерфейс сессионного контекста аутентификации (без почтовых операций).
 */
export interface IAuthContext {
    isAuthenticated: boolean;
    isLoading: boolean;
    authStatus: TAuthStatus;
    authProvider: TAuthProvider | null;
    user: IUser | null;
    capabilities: IAuthCapabilities;
    /** Открыто ли приложение как Telegram Mini App. */
    isInTelegram: boolean;
    /** Код startapp из launch params, если есть. */
    telegramStartParam: string | null;
    login: (userData: IUser, token: string | null, provider?: TAuthProvider | null) => void;
    logout: () => void;
    register: () => Promise<void>;
    registerWithInvite: (code: string, webProfile?: IWebInviteProfile) => Promise<void>;
}

export const initialAuthCapabilities = buildAuthCapabilities(null, false);

/**
 * Начальное состояние контекста аутентификации.
 */
export const initialAuthState: IAuthContext = {
    isAuthenticated: false,
    isLoading: true,
    authStatus: 'loading',
    authProvider: null,
    user: null,
    capabilities: initialAuthCapabilities,
    isInTelegram: false,
    telegramStartParam: null,
    login: () => {},
    logout: () => {},
    register: async () => {},
    registerWithInvite: async () => {},
};

export const AuthContext = createContext<IAuthContext>(initialAuthState);
