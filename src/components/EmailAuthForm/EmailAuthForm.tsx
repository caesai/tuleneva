import React, { useState } from 'react';
import css from './EmailAuthForm.module.css';

export interface IEmailAuthFormProps {
    /** Текст кнопки отправки */
    submitLabel: string;
    /** Начальное значение почты */
    defaultEmail?: string;
    /** Блокировка полей во время запроса */
    loading?: boolean;
    /** Компактный вид (админка / блок в расписании) */
    compact?: boolean;
    /** Показать поле текущего пароля (смена при уже привязанной почте) */
    requireCurrentPassword?: boolean;
    /**
     * Отправка формы.
     * @param email - Нормализованная почта
     * @param password - Новый пароль
     * @param currentPassword - Текущий пароль, если requireCurrentPassword
     */
    onSubmit: (
        email: string,
        password: string,
        currentPassword?: string,
    ) => Promise<void> | void;
}

/**
 * Форма почты и пароля для входа или привязки учётки.
 */
export const EmailAuthForm: React.FC<IEmailAuthFormProps> = ({
    submitLabel,
    defaultEmail = '',
    loading = false,
    compact = false,
    requireCurrentPassword = false,
    onSubmit,
}) => {
    const [email, setEmail] = useState(defaultEmail);
    const [password, setPassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        const trimmed = email.trim();
        if (!trimmed) {
            setLocalError('Укажите почту.');
            return;
        }
        if (password.length < 8) {
            setLocalError('Пароль не короче 8 символов.');
            return;
        }
        if (requireCurrentPassword && currentPassword.length < 8) {
            setLocalError('Укажите текущий пароль.');
            return;
        }
        try {
            await onSubmit(
                trimmed,
                password,
                requireCurrentPassword ? currentPassword : undefined,
            );
            setPassword('');
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
            {requireCurrentPassword && (
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
            <input
                className={css.input}
                type="password"
                name="password"
                autoComplete={requireCurrentPassword ? 'new-password' : 'current-password'}
                placeholder={requireCurrentPassword ? 'Новый пароль (мин. 8)' : 'Пароль (мин. 8)'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                aria-label="Пароль"
            />
            {localError && (
                <p className={css.error} role="alert">{localError}</p>
            )}
            <button
                className={css.submit}
                type="submit"
                disabled={loading}
            >
                {loading ? 'Отправка...' : submitLabel}
            </button>
        </form>
    );
};
