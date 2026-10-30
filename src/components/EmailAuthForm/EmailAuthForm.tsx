import React, { useState } from 'react';
import css from './EmailAuthForm.module.css';

/** Режимы самообслуживания почты (вход / привязка / сброс). */
export type TEmailAuthMode = 'login' | 'link' | 'forgot' | 'reset';

export interface IEmailAuthFormProps {
    /** Режим формы */
    mode: TEmailAuthMode;
    /** Текст кнопки отправки (иначе — по умолчанию для режима) */
    submitLabel?: string;
    /** Начальное значение почты */
    defaultEmail?: string;
    /** Блокировка полей во время запроса */
    loading?: boolean;
    /** Компактный вид (админка / блок в расписании) */
    compact?: boolean;
    /** Показать поле текущего пароля (режим link при уже привязанной почте) */
    requireCurrentPassword?: boolean;
    /**
     * Отправка формы.
     * @param payload - Поля по режиму
     */
    onSubmit: (payload: {
        email?: string;
        password?: string;
        currentPassword?: string;
    }) => Promise<void> | void;
    /** Переход к «забыли пароль» (режим login) */
    onForgotClick?: () => void;
    /** Назад ко входу (режим forgot) */
    onBack?: () => void;
}

const DEFAULT_LABELS: Record<TEmailAuthMode, string> = {
    login: 'Войти',
    link: 'Привязать',
    forgot: 'Отправить ссылку',
    reset: 'Сохранить пароль',
};

/**
 * Единая форма почты: вход, привязка, запрос сброса и новый пароль.
 */
export const EmailAuthForm: React.FC<IEmailAuthFormProps> = ({
    mode,
    submitLabel,
    defaultEmail = '',
    loading = false,
    compact = false,
    requireCurrentPassword = false,
    onSubmit,
    onForgotClick,
    onBack,
}) => {
    const [email, setEmail] = useState(defaultEmail);
    const [password, setPassword] = useState('');
    const [passwordRepeat, setPasswordRepeat] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    const label = submitLabel ?? DEFAULT_LABELS[mode];
    const needsEmail = mode === 'login' || mode === 'link' || mode === 'forgot';
    const needsPassword = mode === 'login' || mode === 'link' || mode === 'reset';
    const needsRepeat = mode === 'reset';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        const trimmed = email.trim();

        if (needsEmail && !trimmed) {
            setLocalError('Укажите почту.');
            return;
        }
        if (needsPassword && password.length < 8) {
            setLocalError('Пароль не короче 8 символов.');
            return;
        }
        if (needsRepeat && password !== passwordRepeat) {
            setLocalError('Пароли не совпадают.');
            return;
        }
        if (mode === 'link' && requireCurrentPassword && currentPassword.length < 8) {
            setLocalError('Укажите текущий пароль.');
            return;
        }

        try {
            await onSubmit({
                email: needsEmail ? trimmed : undefined,
                password: needsPassword ? password : undefined,
                currentPassword:
                    mode === 'link' && requireCurrentPassword ? currentPassword : undefined,
            });
            setPassword('');
            setPasswordRepeat('');
            setCurrentPassword('');
        } catch (err) {
            setLocalError(err instanceof Error ? err.message : 'Не удалось отправить.');
        }
    };

    return (
        <form
            className={compact ? css.formCompact : css.form}
            onSubmit={handleSubmit}
            noValidate
        >
            {needsEmail && (
                <input
                    className={css.input}
                    type="email"
                    name="email"
                    autoComplete="username"
                    placeholder="Почта"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    aria-label="Почта"
                />
            )}
            {mode === 'link' && requireCurrentPassword && (
                <input
                    className={css.input}
                    type="password"
                    name="currentPassword"
                    autoComplete="current-password"
                    placeholder="Текущий пароль"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    disabled={loading}
                    aria-label="Текущий пароль"
                />
            )}
            {needsPassword && (
                <input
                    className={css.input}
                    type="password"
                    name="password"
                    autoComplete={
                        mode === 'reset' || (mode === 'link' && requireCurrentPassword)
                            ? 'new-password'
                            : 'current-password'
                    }
                    placeholder={
                        mode === 'reset' || (mode === 'link' && requireCurrentPassword)
                            ? 'Новый пароль (мин. 8)'
                            : 'Пароль (мин. 8)'
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    aria-label={mode === 'reset' ? 'Новый пароль' : 'Пароль'}
                />
            )}
            {needsRepeat && (
                <input
                    className={css.input}
                    type="password"
                    name="passwordRepeat"
                    autoComplete="new-password"
                    placeholder="Повторите пароль"
                    value={passwordRepeat}
                    onChange={(e) => setPasswordRepeat(e.target.value)}
                    disabled={loading}
                    aria-label="Повторите пароль"
                />
            )}
            {localError && (
                <p className={css.error} role="alert">{localError}</p>
            )}
            <button
                className={css.submit}
                type="submit"
                disabled={loading}
            >
                {loading ? 'Отправка...' : label}
            </button>
            {mode === 'login' && onForgotClick && (
                <button
                    type="button"
                    className={css.secondary}
                    onClick={onForgotClick}
                    disabled={loading}
                >
                    Забыли пароль?
                </button>
            )}
            {mode === 'forgot' && onBack && (
                <button
                    type="button"
                    className={css.secondary}
                    onClick={onBack}
                    disabled={loading}
                >
                    Назад ко входу
                </button>
            )}
        </form>
    );
};
