import React, { useCallback, useEffect, useState } from 'react';
import { APIGetUsers, APIUpdateUserRole, APIDeleteUser, APIGenerateInvite } from '@/api/user.api.ts';
import type { IUser, TRole } from '@/types/user.types.ts';
import type { TAuthProvider } from '@/types/auth.types.ts';
import { Loader } from '@/components/Loader/Loader.tsx';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';
import css from './AdminPage.module.css';
import { useAuth } from '@/hooks/useAuth.ts';
import { useNavigate } from 'react-router-dom';
import {
    canAssignRole,
    canDeleteUser,
    getAssignableRoles,
    isAdminLike,
} from '@/utils/rolePermissions.ts';

const ROLE_LABELS: Record<TRole, string> = {
    guest: 'Гость',
    user: 'Пользователь',
    admin: 'Администратор',
    super_admin: 'Супер администратор',
};

/**
 * @description Страница администратора для управления пользователями: смена роли,
 * удаление, генерация инвайт-ссылок (Telegram Mini App / веб). Доступна только
 * пользователям с ролью admin или super_admin (проверка через {@link isAdminLike}).
 *
 * Эффект загрузки списка пользователей зависит от примитивных идентификаторов
 * текущего пользователя (`user?._id`, `user?.role`), чтобы исключить цикл
 * "новый объект user на каждый рендер → re-fetch → re-render → ...".
 * @returns {JSX.Element} Разметка страницы или прелоадер/сообщение об ошибке.
 */
export const AdminPage: React.FC = () => {
    const [users, setUsers] = useState<IUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [isInviteOptionsOpen, setIsInviteOptionsOpen] = useState(false);
    const [inviteLink, setInviteLink] = useState<string | null>(null);
    const [webInviteLink, setWebInviteLink] = useState<string | null>(null);
    const [inviteAllowedProviders, setInviteAllowedProviders] = useState<TAuthProvider[]>([]);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [inviteInitialRole, setInviteInitialRole] = useState<'guest' | 'user'>('guest');
    const [inviteAllowTelegram, setInviteAllowTelegram] = useState(true);
    const [inviteAllowWeb, setInviteAllowWeb] = useState(true);
    const { user } = useAuth();
    const navigate = useNavigate();
    const userId = user?._id;
    const userRole = user?.role;

    /**
     * @description Загружает список пользователей через {@link APIGetUsers}.
     * Стабильная ссылка (useCallback с пустыми зависимостями), чтобы её можно
     * было безопасно использовать в зависимостях `useEffect`.
     * @returns {Promise<void>}
     */
    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const response = await APIGetUsers();
            if (response.ok) {
                const data = await response.json();
                setUsers(data);
            } else {
                setError('Failed to fetch users');
            }
        } catch (err) {
            setError('An error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!userRole) {
            setLoading(false);
            return;
        }
        if (!isAdminLike(userRole)) {
            navigate('/');
            return;
        }
        fetchUsers();
    }, [userId, userRole, navigate, fetchUsers]);

    const handleRoleChange = async (userId: string, newRole: TRole, targetRole: TRole) => {
        if (!user || !canAssignRole(user.role, targetRole, newRole)) {
            alert('Недостаточно прав для изменения роли');
            return;
        }

        try {
            const response = await APIUpdateUserRole(userId || '', newRole);
            if (response.ok) {
                setUsers(prev => prev.map(u => u._id === userId ? { ...u, role: newRole } : u));
            } else {
                const data = await response.json().catch(() => ({}));
                alert(data.message || 'Failed to update role');
            }
        } catch (err) {
            console.error(err);
            alert('An error occurred');
        }
    };

    const handleDeleteUser = async (userId: string, targetRole: TRole) => {
        if (!user || !canDeleteUser(user.role, targetRole, userId === user._id)) {
            alert('Недостаточно прав для удаления пользователя');
            return;
        }

        if (!confirm('Are you sure you want to delete this user?')) return;

        try {
            const response = await APIDeleteUser(userId || '');
            if (response.ok) {
                setUsers(prev => prev.filter(u => u._id !== userId));
            } else {
                const data = await response.json().catch(() => ({}));
                alert(data.message || 'Failed to delete user');
            }
        } catch (err) {
            console.error(err);
            alert('An error occurred');
        }
    };

    const openInviteOptions = () => {
        setInviteAllowTelegram(true);
        setInviteAllowWeb(true);
        setInviteInitialRole('guest');
        setIsInviteOptionsOpen(true);
    };

    const handleGenerateInvite = async () => {
        const allowedProviders: TAuthProvider[] = [];
        if (inviteAllowTelegram) allowedProviders.push('telegram');
        if (inviteAllowWeb) allowedProviders.push('web');

        if (allowedProviders.length === 0) {
            alert('Выберите хотя бы один способ входа');
            return;
        }

        setInviteLoading(true);
        setCopied(false);
        setInviteLink(null);
        setWebInviteLink(null);
        setInviteAllowedProviders([]);

        try {
            const response = await APIGenerateInvite({
                initialRole: inviteInitialRole,
                allowedProviders,
            });
            if (response.ok) {
                const data = await response.json();
                const providers: TAuthProvider[] = data.allowedProviders ?? allowedProviders;
                setInviteAllowedProviders(providers);
                setInviteLink(
                    providers.includes('telegram')
                        ? (data.telegramInviteLink || data.inviteLink)
                        : null,
                );
                setWebInviteLink(
                    providers.includes('web') ? (data.webInviteLink || null) : null,
                );
                setIsInviteOptionsOpen(false);
                setIsInviteModalOpen(true);
            } else {
                alert('Не удалось сгенерировать ссылку');
            }
        } catch (err) {
            console.error(err);
            alert('Произошла ошибка');
        } finally {
            setInviteLoading(false);
        }
    };

    const handleCopyLink = async () => {
        if (!inviteLink) return;
        try {
            await navigator.clipboard.writeText(inviteLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            const textArea = document.createElement('textarea');
            textArea.value = inviteLink;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (loading) return <div className={css.loading}><Loader /></div>;
    if (error) return <div className={css.error}>{error}</div>;

    return (
        <div className={css.adminPage}>
            <div className={css.header}>
                <button className={css.backButton} onClick={() => navigate('/')}>
                    Назад
                </button>
                <h2 style={{ fontSize: '16px' }}>Управление пользователями</h2>
            </div>
            <div className={css.inviteSection}>
                <button
                    className={css.inviteButton}
                    onClick={openInviteOptions}
                    disabled={inviteLoading}
                >
                    {inviteLoading ? 'Генерация...' : 'Пригласить пользователя'}
                </button>
            </div>

            <ModalPopup isOpen={isInviteOptionsOpen} onClose={() => setIsInviteOptionsOpen(false)}>
                <div className={css.inviteModal}>
                    <h3>Настройки приглашения</h3>
                    <label className={css.inviteLabel}>Начальная роль</label>
                    <select
                        className={css.roleSelect}
                        value={inviteInitialRole}
                        onChange={(e) => setInviteInitialRole(e.target.value as 'guest' | 'user')}
                    >
                        <option value="guest">Гость (ожидает подтверждения)</option>
                        <option value="user">Пользователь</option>
                    </select>
                    <label className={css.inviteLabel}>Способы входа</label>
                    <label>
                        <input
                            type="checkbox"
                            checked={inviteAllowTelegram}
                            onChange={(e) => setInviteAllowTelegram(e.target.checked)}
                        />
                        {' '}Telegram Mini App
                    </label>
                    <label>
                        <input
                            type="checkbox"
                            checked={inviteAllowWeb}
                            onChange={(e) => setInviteAllowWeb(e.target.checked)}
                        />
                        {' '}Веб-браузер
                    </label>
                    <button
                        className={css.copyButton}
                        onClick={handleGenerateInvite}
                        disabled={inviteLoading}
                    >
                        {inviteLoading ? 'Генерация...' : 'Сгенерировать ссылку'}
                    </button>
                </div>
            </ModalPopup>

            <ModalPopup isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)}>
                <div className={css.inviteModal}>
                    <h3>Пригласить пользователя</h3>
                    <p className={css.inviteDescription}>
                        Отправьте одноразовую ссылку пользователю. После использования ссылка станет недействительной.
                    </p>
                    {inviteLink && inviteAllowedProviders.includes('telegram') && (
                        <div className={css.inviteLinkContainer}>
                            <label className={css.inviteLabel}>Telegram Mini App</label>
                            <input
                                className={css.inviteLinkInput}
                                value={inviteLink}
                                readOnly
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                            />
                            <button className={css.copyButton} onClick={handleCopyLink}>
                                {copied ? 'Скопировано!' : 'Копировать'}
                            </button>
                        </div>
                    )}
                    {webInviteLink && inviteAllowedProviders.includes('web') && (
                        <div className={css.inviteLinkContainer}>
                            <label className={css.inviteLabel}>Веб-ссылка</label>
                            <input
                                className={css.inviteLinkInput}
                                value={webInviteLink}
                                readOnly
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                            />
                        </div>
                    )}
                    <button
                        className={css.closeModalButton}
                        onClick={() => setIsInviteModalOpen(false)}
                    >
                        Закрыть
                    </button>
                </div>
            </ModalPopup>

            <div className={css.tableContainer}>
                <table className={css.table}>
                    <thead>
                        <tr>
                            <th>Имя</th>
                            <th>Username</th>
                            <th>Роль</th>
                            <th>Действия</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => {
                            const allowedRoles = user
                                ? getAssignableRoles(user.role, u.role)
                                : [];
                            const assignableRoles =
                                allowedRoles.length > 0 ? allowedRoles : [u.role];
                            const roleSelectDisabled =
                                u._id === user?._id || allowedRoles.length === 0;
                            const deleteDisabled =
                                !user ||
                                !canDeleteUser(user.role, u.role, u._id === user._id);

                            return (
                                <tr key={u._id}>
                                    <td>{u.first_name} {u.last_name}</td>
                                    <td>{u.username ? `@${u.username}` : '-'}</td>
                                    <td>
                                        <select
                                            className={css.roleSelect}
                                            value={u.role}
                                            onChange={(e) =>
                                                handleRoleChange(
                                                    u._id || '',
                                                    e.target.value as TRole,
                                                    u.role,
                                                )
                                            }
                                            disabled={roleSelectDisabled}
                                        >
                                            {assignableRoles.map(role => (
                                                <option key={role} value={role}>
                                                    {ROLE_LABELS[role]}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td>
                                        <button
                                            className={css.deleteButton}
                                            onClick={() => handleDeleteUser(u._id || '', u.role)}
                                            disabled={deleteDisabled}
                                        >
                                            Удалить
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
