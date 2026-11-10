/**
 * @file Карточка пользователя в админке: обычные действия снаружи, опасные в меню.
 */
import React from 'react';
import { EmailAuthForm } from '@/components/EmailAuthForm/EmailAuthForm.tsx';
import { SafeAvatar } from '@/components/SafeAvatar/SafeAvatar.tsx';
import { EMAIL_AUTH_UI_ENABLED } from '@/config/emailAuthUi.ts';
import type { IUser, TRole } from '@/types/user.types.ts';
import {
    canAssignRole,
    canDeleteUser,
    getAssignableRoles,
} from '@/utils/rolePermissions.ts';
import css from './AdminPage.module.css';

const ROLE_LABELS: Record<TRole, string> = {
    guest: 'Гость',
    user: 'Пользователь',
    admin: 'Администратор',
    super_admin: 'Супер администратор',
};

/** Строка журнала ролей. */
export interface IRoleLogEntry {
    id: string;
    fromRole: TRole;
    toRole: TRole;
    createdAt: string;
}

interface UserCardProps {
    /** Кого показываем. */
    person: IUser;
    /** Кто смотрит. От него зависят права. */
    actor: IUser;
    /** Меню опасных действий открыто. */
    menuOpen: boolean;
    /** Журнал ролей открыт. */
    roleLogOpen: boolean;
    roleLogLoading: boolean;
    roleLogEntries: IRoleLogEntry[];
    /** Форма почты открыта. */
    emailFormOpen: boolean;
    emailLoading: boolean;
    onToggleMenu: () => void;
    onToggleRoleLog: () => void;
    onToggleEmail: () => void;
    /** Выбор новой роли ещё не пишет в API. */
    onRolePick: (role: TRole) => void;
    onAskDelete: () => void;
    onSubmitEmail: (email: string, password: string) => Promise<void>;
}

/**
 * Имя для подписей. Фамилия добавляется, если она есть.
 * @param person Пользователь
 * @returns Строка
 */
const displayName = (person: IUser): string =>
    [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || 'Без имени';

/**
 * Карточка одного пользователя.
 * @param props Пользователь, права и обработчики
 * @returns Карточка
 */
export const UserCard: React.FC<UserCardProps> = ({
    person,
    actor,
    menuOpen,
    roleLogOpen,
    roleLogLoading,
    roleLogEntries,
    emailFormOpen,
    emailLoading,
    onToggleMenu,
    onToggleRoleLog,
    onToggleEmail,
    onRolePick,
    onAskDelete,
    onSubmitEmail,
}) => {
    const name = displayName(person);
    const allowedRoles = getAssignableRoles(actor.role, person.role);
    const assignableRoles = allowedRoles.length > 0 ? allowedRoles : [person.role];
    const roleSelectDisabled = person._id === actor._id || allowedRoles.length === 0;
    const deleteDisabled = !canDeleteUser(actor.role, person.role, person._id === actor._id);
    const canEditEmail = EMAIL_AUTH_UI_ENABLED && canAssignRole(actor.role, person.role, person.role);

    return (
        <article className={css.userCard}>
            <div className={css.userMain}>
                <SafeAvatar
                    src={person.photo_url || undefined}
                    fallback={name.charAt(0).toUpperCase() || '?'}
                    sx={{ width: 44, height: 44, fontSize: 16 }}
                />
                <div className={css.userIdentity}>
                    <p className={css.userName}>{name}</p>
                    <p className={css.userHandle}>
                        {person.username ? `@${person.username}` : 'без username'}
                    </p>
                    {person.bandName ? <p className={css.userBand}>{person.bandName}</p> : null}
                    {person.emailLogin ? <p className={css.userMail}>{person.emailLogin}</p> : null}
                    <span className={css.rolePill}>{ROLE_LABELS[person.role]}</span>
                </div>
            </div>
            <div className={css.userActions}>
                <button type="button" className={css.quietButton} onClick={onToggleRoleLog}>
                    {roleLogOpen ? 'Скрыть журнал' : 'Журнал'}
                </button>
                <button
                    type="button"
                    className={css.quietButton}
                    aria-expanded={menuOpen}
                    aria-label={`Действия ${name}`}
                    onClick={onToggleMenu}
                >
                    Действия
                </button>
            </div>
            {menuOpen ? (
                <div className={css.menu}>
                    <label className={css.menuLabel}>
                        Роль
                        <select
                            className={css.roleSelect}
                            aria-label={`Роль ${name}`}
                            value={person.role}
                            disabled={roleSelectDisabled}
                            onChange={(event) => onRolePick(event.target.value as TRole)}
                        >
                            {assignableRoles.map((role) => (
                                <option key={role} value={role}>
                                    {ROLE_LABELS[role]}
                                </option>
                            ))}
                        </select>
                    </label>
                    {canEditEmail ? (
                        <button type="button" className={css.quietButton} onClick={onToggleEmail}>
                            {emailFormOpen ? 'Скрыть почту' : 'Почта'}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className={css.deleteButton}
                        onClick={onAskDelete}
                        disabled={deleteDisabled}
                    >
                        Удалить
                    </button>
                </div>
            ) : null}
            {emailFormOpen && canEditEmail ? (
                <EmailAuthForm
                    mode="link"
                    compact
                    submitLabel="Отправить ссылку на почту"
                    defaultEmail={person.emailLogin || ''}
                    loading={emailLoading}
                    onSubmit={({ email, password }) => {
                        if (!email || !password) {
                            return;
                        }
                        return onSubmitEmail(email, password);
                    }}
                />
            ) : null}
            {roleLogOpen ? (
                <div className={css.inviteHistory}>
                    <p className={css.inviteHistoryTitle}>Смены ролей</p>
                    {roleLogLoading ? (
                        <p className={css.inviteDescription}>Загрузка…</p>
                    ) : roleLogEntries.length === 0 ? (
                        <p className={css.inviteDescription}>Записей нет</p>
                    ) : (
                        <ul className={css.inviteHistoryList}>
                            {roleLogEntries.map((entry) => (
                                <li key={entry.id}>
                                    {ROLE_LABELS[entry.fromRole]}
                                    {' → '}
                                    {ROLE_LABELS[entry.toRole]}
                                    {' · '}
                                    {new Date(entry.createdAt).toLocaleString('ru-RU')}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            ) : null}
        </article>
    );
};

export { ROLE_LABELS };
