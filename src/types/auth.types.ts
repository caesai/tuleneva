import type { IUser } from '@/types/user.types.ts';

/** Поддерживаемые провайдеры аутентификации. */
export type TAuthProvider = 'telegram' | 'web' | 'email' | 'phone';

/** Статус сессии на клиенте. */
export type TAuthStatus =
    | 'loading'
    | 'anonymous'
    | 'guest_pending'
    | 'authenticated';

export interface IAuthSessionResponse {
    valid: boolean;
    token?: string | null;
    user?: IUser;
    authProvider?: TAuthProvider | null;
}

export interface ITelegramAuthPayload {
    provider: 'telegram';
    initData: object;
    user: string;
}

export interface IWebAuthPayload {
    provider: 'web';
}

export type TProviderAuthPayload = ITelegramAuthPayload | IWebAuthPayload;

export interface IWebInviteProfile {
    firstName: string;
    lastName?: string;
    email?: string;
}

export interface IInviteUsePayload {
    code: string;
    provider: TAuthProvider;
    telegram?: {
        initData: object;
        user: string;
    };
    web?: IWebInviteProfile;
}

export interface IInviteValidateResponse {
    valid: boolean;
    purpose?: string;
    allowedProviders?: TAuthProvider[];
}

export interface IAuthCapabilities {
    canManageBookings: boolean;
    canViewUserDetails: boolean;
    isAdmin: boolean;
    isGuest: boolean;
}

export const buildAuthCapabilities = (
    user: IUser | null,
    isAuthenticated: boolean,
): IAuthCapabilities => {
    const isGuest = user?.role === 'guest';
    const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
    const canManageBookings = isAuthenticated && !!user && !isGuest;

    return {
        canManageBookings,
        canViewUserDetails: canManageBookings,
        isAdmin,
        isGuest: !!isGuest,
    };
};

export const resolveAuthStatus = (
    isLoading: boolean,
    isAuthenticated: boolean,
    user: IUser | null,
): TAuthStatus => {
    if (isLoading) return 'loading';
    if (!user) return 'anonymous';
    if (!isAuthenticated && user.role === 'guest') return 'guest_pending';
    if (isAuthenticated) return 'authenticated';
    if (user.role === 'guest') return 'guest_pending';
    return 'anonymous';
};
