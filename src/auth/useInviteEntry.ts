/**
 * @file Хуки входа по инвайту: модалка на лендинге и тихий startapp на /app.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { APIValidateInvite } from '@/api/user.api.ts';
import type {
    IInviteValidateResponse,
    IWebInviteProfile,
    TAuthProvider,
} from '@/types/auth.types.ts';
import type { IUser } from '@/types/user.types.ts';
import { readTelegramStartParam } from '@/telegram/useSafeLaunchParams.ts';
import {
    readInviteCodeFromSearchParams,
    shouldSkipLandingInvite,
    shouldSkipTelegramStartInvite,
    showsWebInviteForm,
} from '@/auth/inviteEntry.ts';

type ShowToast = (message: string, type: 'success' | 'error' | 'info') => void;

/**
 * Параметры лендинг-инвайта (/).
 */
export interface UseLandingInviteParams {
    isLoading: boolean;
    isAuthenticated: boolean;
    user: IUser | null;
    isInTelegram: boolean;
    registerWithInvite: (code: string, webProfile?: IWebInviteProfile) => Promise<void>;
    showToast: ShowToast;
    /** После успешного веб-инвайта (привязка почты на странице). */
    onWebInviteSuccess?: () => void;
}

/**
 * Валидация ?invite= / tgWebAppStartParam и применение через registerWithInvite.
 * Разметку модалки оставляет страница.
 * @param params - Сессия, Telegram-флаг и колбэки
 * @returns Состояние модалки и submit
 */
export const useLandingInvite = (params: UseLandingInviteParams) => {
    const {
        isLoading,
        isAuthenticated,
        user,
        isInTelegram,
        registerWithInvite,
        showToast,
        onWebInviteSuccess,
    } = params;

    const [searchParams, setSearchParams] = useSearchParams();
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteAllowedProviders, setInviteAllowedProviders] = useState<TAuthProvider[]>([]);
    const [webFirstName, setWebFirstName] = useState('');
    const [webLastName, setWebLastName] = useState('');

    const showWebInviteForm = showsWebInviteForm({
        isInTelegram,
        allowedProviders: inviteAllowedProviders,
    });

    const clearInviteParams = useCallback(() => {
        searchParams.delete('tgWebAppStartParam');
        searchParams.delete('invite');
        setSearchParams(searchParams, { replace: true });
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        const code = readInviteCodeFromSearchParams(searchParams);
        if (code && !isLoading) {
            if (shouldSkipLandingInvite({ isAuthenticated, user })) {
                clearInviteParams();
                return;
            }

            setInviteCode(code);
            APIValidateInvite(code).then(async (res) => {
                const data = await res.json() as IInviteValidateResponse;
                if (data.valid) {
                    setInviteAllowedProviders(data.allowedProviders ?? ['telegram']);
                    setIsInviteModalOpen(true);
                } else {
                    showToast('Ссылка-приглашение недействительна или уже использована.', 'error');
                    clearInviteParams();
                }
            }).catch(() => {
                showToast('Не удалось проверить ссылку-приглашение.', 'error');
            });
        }
    }, [isLoading, isAuthenticated, user, searchParams, clearInviteParams, showToast]);

    const handleInviteRequestAccess = useCallback(async () => {
        if (!inviteCode) return;
        if (showWebInviteForm && !webFirstName.trim()) {
            showToast('Укажите имя для регистрации.', 'error');
            return;
        }
        setInviteLoading(true);
        try {
            if (showWebInviteForm) {
                await registerWithInvite(inviteCode, {
                    firstName: webFirstName.trim(),
                    lastName: webLastName.trim() || undefined,
                });
            } else {
                await registerWithInvite(inviteCode);
            }
            showToast('Запрос на доступ отправлен администратору.', 'success');
            setIsInviteModalOpen(false);
            clearInviteParams();
            setInviteCode(null);
            setInviteAllowedProviders([]);
            setWebFirstName('');
            setWebLastName('');
            if (showWebInviteForm) {
                onWebInviteSuccess?.();
            }
        } catch (err) {
            console.error('Invite request access failed:', err);
            showToast('Не удалось отправить запрос. Ссылка может быть уже использована.', 'error');
        } finally {
            setInviteLoading(false);
        }
    }, [
        inviteCode,
        registerWithInvite,
        showToast,
        clearInviteParams,
        showWebInviteForm,
        webFirstName,
        webLastName,
        onWebInviteSuccess,
    ]);

    return {
        isInviteModalOpen,
        setIsInviteModalOpen,
        inviteLoading,
        webFirstName,
        setWebFirstName,
        webLastName,
        setWebLastName,
        showWebInviteForm,
        handleInviteRequestAccess,
    };
};

/**
 * Параметры тихого startapp на /app.
 */
export interface UseTelegramStartInviteParams {
    isInTelegram: boolean;
    authLoading: boolean;
    isAuthenticated: boolean;
    user: IUser | null;
    launchParams: object;
    registerWithInvite: (code: string, webProfile?: IWebInviteProfile) => Promise<void>;
    showToast: ShowToast;
}

/**
 * Применяет startapp на расписании без модалки.
 * @param params - Сессия Mini App и колбэки
 * @returns void (эффект внутри)
 */
export const useTelegramStartInvite = (params: UseTelegramStartInviteParams): void => {
    const {
        isInTelegram,
        authLoading,
        isAuthenticated,
        user,
        launchParams,
        registerWithInvite,
        showToast,
    } = params;

    const inviteApplyStarted = useRef(false);

    useEffect(() => {
        if (!isInTelegram || authLoading || inviteApplyStarted.current) {
            return;
        }
        const code = readTelegramStartParam(launchParams);
        if (!code) {
            return;
        }
        if (shouldSkipTelegramStartInvite({ isAuthenticated, user })) {
            return;
        }
        inviteApplyStarted.current = true;
        void registerWithInvite(code)
            .then(() => {
                showToast('Доступ по ссылке открыт. Можно бронировать.', 'success');
            })
            .catch(() => {
                inviteApplyStarted.current = false;
                showToast(
                    'Не удалось применить ссылку-приглашение. Попросите новую у администратора.',
                    'error',
                );
            });
    }, [
        authLoading,
        isAuthenticated,
        isInTelegram,
        launchParams,
        registerWithInvite,
        showToast,
        user,
    ]);
};
