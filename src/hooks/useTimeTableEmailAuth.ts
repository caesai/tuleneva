import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ToastType } from '@/components/Toast/Toast';
import {
    EMAIL_AUTH_UI_ENABLED,
    shouldShowEmailLinkForm,
} from '@/config/emailAuthUi.ts';
import { useEmailAuth } from '@/auth/useEmailAuth.ts';
import type { IUser } from '@/types/user.types.ts';

export interface ITimeTableEmailAuthOptions {
    /** Текущий пользователь или null до входа */
    user: IUser | null;
    /** Сессия подтверждена */
    isAuthenticated: boolean;
    /** Аккаунт ждёт подтверждения */
    isGuest: boolean;
    /** Админ или суперадмин */
    isAdmin: boolean;
    /** Открыто внутри Telegram Mini App */
    isInTelegram: boolean;
    /** Сессия ещё читается */
    authLoading: boolean;
    /** Тост об успехе или ошибке */
    showToast: (message: string, type?: ToastType) => void;
}

/**
 * Состояние почтовых окон расписания: вход, сброс по ссылке и привязка.
 * @param options Роль, сессия и тост страницы
 * @returns Видимость привязки, открытие её окна и пропсы для диалогов
 */
export const useTimeTableEmailAuth = ({
    user,
    isAuthenticated,
    isGuest,
    isAdmin,
    isInTelegram,
    authLoading,
    showToast,
}: ITimeTableEmailAuthOptions) => {
    const {
        linkEmailPassword,
        loginWithEmailPassword,
        confirmEmailToken,
        requestPasswordReset,
        resetPasswordWithToken,
    } = useEmailAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const [emailLinkLoading, setEmailLinkLoading] = useState(false);
    const [isEmailLinkOpen, setIsEmailLinkOpen] = useState(false);
    const [isEmailLoginOpen, setIsEmailLoginOpen] = useState(false);
    const [emailLoginLoading, setEmailLoginLoading] = useState(false);
    const [forgotMode, setForgotMode] = useState(false);
    const [forgotLoading, setForgotLoading] = useState(false);
    const [isPasswordResetOpen, setIsPasswordResetOpen] = useState(false);
    const [passwordResetToken, setPasswordResetToken] = useState<string | null>(null);
    const [passwordResetLoading, setPasswordResetLoading] = useState(false);

    /**
     * Привязка своей почты открывается иконкой у календаря: админ — всегда,
     * остальные — при VITE_EMAIL_AUTH_UI. Кнопка входа в браузере только при флаге.
     */
    const showEmailLinkForm = shouldShowEmailLinkForm({
        isAuthenticated: isAuthenticated && !!user,
        isGuest,
        isAdmin,
    });
    const showEmailLoginButton =
        EMAIL_AUTH_UI_ENABLED &&
        !isInTelegram &&
        !authLoading &&
        !isAuthenticated;

    const emailConfirmParam = searchParams.get('emailConfirm');
    const passwordResetParam = searchParams.get('passwordReset');

    /**
     * Открывает модалку сброса пароля по ссылке из письма (?passwordReset=token).
     * Без флага UI: ссылка в письме ведёт на прод, форма «забыли пароль» остаётся за флагом.
     */
    useEffect(() => {
        if (!passwordResetParam || authLoading) {
            return;
        }
        setPasswordResetToken(passwordResetParam);
        setIsPasswordResetOpen(true);
        const next = new URLSearchParams(searchParams);
        next.delete('passwordReset');
        setSearchParams(next, { replace: true });
    }, [authLoading, passwordResetParam, searchParams, setSearchParams]);

    /**
     * Подтверждение почты по ссылке из письма (?emailConfirm=token).
     */
    useEffect(() => {
        if (!emailConfirmParam || authLoading) {
            return;
        }

        let cancelled = false;
        const run = async () => {
            try {
                await confirmEmailToken(emailConfirmParam);
                if (!cancelled) {
                    showToast('Почта подтверждена. Вход выполнен.', 'success');
                }
            } catch (err) {
                if (!cancelled) {
                    showToast(
                        err instanceof Error ? err.message : 'Не удалось подтвердить почту.',
                        'error',
                    );
                }
            } finally {
                if (!cancelled) {
                    setSearchParams((prev) => {
                        const next = new URLSearchParams(prev);
                        next.delete('emailConfirm');
                        return next;
                    }, { replace: true });
                }
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [authLoading, confirmEmailToken, emailConfirmParam, setSearchParams, showToast]);

    const openEmailLink = () => setIsEmailLinkOpen(true);

    return {
        showEmailLinkForm,
        openEmailLink,
        showEmailLoginButton,
        isEmailLoginOpen,
        setIsEmailLoginOpen,
        forgotMode,
        setForgotMode,
        forgotLoading,
        setForgotLoading,
        requestPasswordReset,
        emailLoginLoading,
        setEmailLoginLoading,
        loginWithEmailPassword,
        isPasswordResetOpen,
        setIsPasswordResetOpen,
        setPasswordResetToken,
        passwordResetLoading,
        setPasswordResetLoading,
        passwordResetToken,
        resetPasswordWithToken,
        showLinkDialog: showEmailLinkForm && isEmailLinkOpen,
        setIsEmailLinkOpen,
        user,
        emailLinkLoading,
        setEmailLinkLoading,
        linkEmailPassword,
        showToast,
    };
};

/** Состояние {@link useTimeTableEmailAuth}, которое рисуют диалоги. */
export type TTimeTableEmailAuthState = ReturnType<typeof useTimeTableEmailAuth>;
