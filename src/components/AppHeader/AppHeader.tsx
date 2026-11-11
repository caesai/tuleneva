/**
 * @file Общая шапка: раздел, назад там, где есть родительский экран, и действия справа.
 * На корне расписания назад нет — его даёт Telegram, чтобы не дублировать жест закрытия.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon } from '@/components/Icons/Icons.tsx';
import css from './AppHeader.module.css';

interface AppHeaderProps {
    /** Название раздела */
    title: string;
    /** Куда ведёт стрелка. Без неё слева знак студии на главную. */
    backTo?: string;
    /** Доступное имя стрелки */
    backLabel?: string;
    /** Почта, админка и прочие действия */
    children?: React.ReactNode;
}

/**
 * Липкая шапка приложения.
 * @param props Заголовок, необязательный назад и действия
 * @returns Шапка
 */
export const AppHeader: React.FC<AppHeaderProps> = ({
    title,
    backTo,
    backLabel = 'Назад',
    children,
}) => (
    <header className={css.bar}>
        <div className={css.lead}>
            {backTo ? (
                <Link className={css.back} to={backTo} aria-label={backLabel}>
                    <ArrowLeftIcon className={css.icon} />
                </Link>
            ) : (
                <Link className={css.brand} to="/" aria-label="На главную">
                    <img className={css.mark} src="/logo_main512.svg" alt="" width={28} height={28} />
                </Link>
            )}
            <h1 className={css.title}>{title}</h1>
        </div>
        {children ? <div className={css.actions}>{children}</div> : null}
    </header>
);
