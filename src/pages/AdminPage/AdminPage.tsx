import React, { useCallback, useEffect, useState } from 'react';
import {
    APIGetUsers,
    APIUpdateUserRole,
    APIDeleteUser,
    APIGenerateInvite,
    APIRevokeInvite,
    APIGetInviteHistory,
    APIGetUserRoleLog,
    APISetUserEmailLogin,
} from '@/api/user.api.ts';
import type { IUser, TRole } from '@/types/user.types.ts';
import type { TAuthProvider } from '@/types/auth.types.ts';
import { DelayedLoader } from '@/components/Loader/DelayedLoader.tsx';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';
import css from './AdminPage.module.css';
import { useAuth } from '@/hooks/useAuth.ts';
import { Link, useNavigate } from 'react-router-dom';
import {
    canAssignRole,
    canDeleteUser,
    isAdminLike,
    isSuperAdmin,
} from '@/utils/rolePermissions.ts';
import { ROLE_LABELS, UserCard, type IRoleLogEntry } from './UserCard.tsx';
import { useWebSocket, type WebSocketMessage } from '@/hooks/useWebSocket.ts';
import { retryOnceIfUnauthorized } from '@/api/retryUnauthorized.ts';

/** Краткая запись инвайта из GET /api/auth/invite/history. */
interface IInviteHistoryItem {
    code: string;
    multiUse: boolean;
    useCount: number;
    expiresAt: string;
    usedAt: string | null;
    revokedAt: string | null;
    allowedProviders?: string[];
}

/**
 * @description Страница администратора для управления пользователями: смена роли,
 * удаление, генерация инвайт-ссылок (Telegram Mini App / веб). Доступна только
 * пользователям с ролью admin или super_admin (проверка через {@link isAdminLike}).
 *
 * Список грузится только после `authStatus === 'authenticated'`. Пока сессия
 * не готова, на экране лоадер, а не ошибка и не редирект. 401/403 на первом
 * запросе повторяются один раз — токен к этому моменту уже записан.
 * Эффект зависит от примитивных идентификаторов текущего пользователя
 * (`user?._id`, `user?.role`), чтобы исключить цикл
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
    const [inviteMultiUse, setInviteMultiUse] = useState(false);
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [inviteRevoked, setInviteRevoked] = useState(false);
    const [revokeLoading, setRevokeLoading] = useState(false);
    const [emailLoginUserId, setEmailLoginUserId] = useState<string | null>(null);
    const [emailLoginLoading, setEmailLoginLoading] = useState(false);
    const [inviteLive, setInviteLive] = useState<IInviteHistoryItem[]>([]);
    const [inviteHistory, setInviteHistory] = useState<IInviteHistoryItem[]>([]);
    const [roleLogUserId, setRoleLogUserId] = useState<string | null>(null);
    const [roleLogEntries, setRoleLogEntries] = useState<IRoleLogEntry[]>([]);
    const [roleLogLoading, setRoleLogLoading] = useState(false);
    const [query, setQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState<'all' | TRole>('all');
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [roleConfirm, setRoleConfirm] = useState<{
        id: string;
        name: string;
        from: TRole;
        to: TRole;
    } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<{
        id: string;
        name: string;
        role: TRole;
    } | null>(null);
    const { user, authStatus } = useAuth();
    const navigate = useNavigate();
    const userId = user?._id;
    const userRole = user?.role;

    /**
     * @description Загружает список пользователей через {@link APIGetUsers}.
     * Стабильная ссылка (useCallback с пустыми зависимостями), чтобы её можно
     * было безопасно использовать в зависимостях `useEffect`.
     * @returns {Promise<void>}
     */
    /**
     * @description Загружает список пользователей.
     * @param [options.silent] - Без полноэкранного лоадера (WebSocket-обновление).
     * @returns {Promise<void>}
     */
    const fetchUsers = useCallback(async (options: { silent?: boolean } = {}) => {
        if (!options.silent) {
            setLoading(true);
        }
        try {
            const response = await retryOnceIfUnauthorized(() => APIGetUsers());
            if (response.ok) {
                const data = await response.json();
                setUsers(data);
                setError(null);
            } else if (!options.silent) {
                setError('Failed to fetch users');
            }
        } catch (err) {
            if (!options.silent) {
                setError('An error occurred');
            }
            console.error(err);
        } finally {
            if (!options.silent) {
                setLoading(false);
            }
        }
    }, []);

    /**
     * Загружает живые инвайты и историю.
     * @returns {Promise<void>}
     */
    const fetchInviteHistory = useCallback(async () => {
        try {
            const response = await retryOnceIfUnauthorized(() => APIGetInviteHistory());
            if (!response.ok) {
                return;
            }
            const data = (await response.json()) as {
                live?: IInviteHistoryItem[];
                history?: IInviteHistoryItem[];
            };
            setInviteLive(data.live ?? []);
            setInviteHistory(data.history ?? []);
        } catch (err) {
            console.error(err);
        }
    }, []);

    useEffect(() => {
        if (authStatus === 'loading') {
            return;
        }
        if (authStatus !== 'authenticated' || !userRole || !isAdminLike(userRole)) {
            setLoading(false);
            return;
        }
        fetchUsers();
        void fetchInviteHistory();
    }, [authStatus, userId, userRole, fetchUsers, fetchInviteHistory]);

    /**
     * При регистрации/инвайте/смене роли без Telegram-уведомлений
     * админка обновляет список по WebSocket `users_update`.
     */
    const handleUsersSocketMessage = useCallback(
        (message: WebSocketMessage) => {
            if (message.type !== 'users_update') {
                return;
            }
            if (!userRole || !isAdminLike(userRole)) {
                return;
            }
            void fetchUsers({ silent: true });
        },
        [fetchUsers, userRole],
    );

    useWebSocket({
        onMessage: handleUsersSocketMessage,
    });

    const handleRoleChange = async (userId: string, newRole: TRole, targetRole: TRole) => {
        if (!user || !canAssignRole(user.role, targetRole, newRole)) {
            alert('Недостаточно прав для изменения роли');
            return;
        }

        try {
            const response = await APIUpdateUserRole(userId || '', newRole);
            if (response.ok) {
                setUsers(prev => prev.map(u => u._id === userId ? { ...u, role: newRole } : u));
                if (roleLogUserId === userId) {
                    void loadRoleLog(userId);
                }
            } else {
                const data = await response.json().catch(() => ({}));
                alert(data.message || 'Failed to update role');
            }
        } catch (err) {
            console.error(err);
            alert('An error occurred');
        }
    };

    /**
     * Загружает журнал смен ролей для пользователя.
     * @param targetId - Mongo _id
     */
    const loadRoleLog = async (targetId: string) => {
        setRoleLogLoading(true);
        try {
            const response = await APIGetUserRoleLog(targetId);
            if (response.ok) {
                const data = (await response.json()) as { entries?: IRoleLogEntry[] };
                setRoleLogEntries(data.entries ?? []);
            } else {
                setRoleLogEntries([]);
            }
        } catch (err) {
            console.error(err);
            setRoleLogEntries([]);
        } finally {
            setRoleLogLoading(false);
        }
    };

    /**
     * Открывает или закрывает журнал ролей у строки пользователя.
     * @param targetId - Mongo _id
     */
    const toggleRoleLog = (targetId: string) => {
        if (roleLogUserId === targetId) {
            setRoleLogUserId(null);
            setRoleLogEntries([]);
            return;
        }
        setRoleLogUserId(targetId);
        void loadRoleLog(targetId);
    };

    /**
     * Задаёт почту и временный пароль; на почту уходит ссылка подтверждения.
     * При ошибке бросает исключение, чтобы EmailAuthForm не очищал пароль.
     */
    const handleSetEmailLogin = async (
        targetId: string,
        targetRole: TRole,
        email: string,
        password: string,
    ) => {
        if (!user || !canAssignRole(user.role, targetRole, targetRole)) {
            const message = 'Недостаточно прав для изменения этого пользователя';
            alert(message);
            throw new Error(message);
        }
        setEmailLoginLoading(true);
        try {
            const response = await APISetUserEmailLogin(targetId, email, password);
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                const message = data.message || 'Не удалось сохранить почту';
                alert(message);
                throw new Error(message);
            }
            const updated = await response.json() as IUser & {
                pendingConfirmation?: boolean;
            };
            setUsers((prev) =>
                prev.map((u) => (u._id === targetId ? { ...u, ...updated } : u)),
            );
            setEmailLoginUserId(null);
            alert(
                updated.pendingConfirmation
                    ? 'На почту отправлена ссылка для подтверждения.'
                    : 'Почта и пароль сохранены.',
            );
        } catch (err) {
            console.error(err);
            if (err instanceof Error) {
                throw err;
            }
            const message = 'Ошибка при сохранении почты';
            alert(message);
            throw new Error(message);
        } finally {
            setEmailLoginLoading(false);
        }
    };

    const handleDeleteUser = async (userId: string, targetRole: TRole) => {
        if (!user || !canDeleteUser(user.role, targetRole, userId === user._id)) {
            alert('Недостаточно прав для удаления пользователя');
            return;
        }

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
        setInviteMultiUse(false);
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
        setInviteCode(null);
        setInviteRevoked(false);

        try {
            const response = await APIGenerateInvite({
                initialRole: inviteInitialRole,
                allowedProviders,
                multiUse: inviteMultiUse,
            });
            if (response.ok) {
                const data = await response.json();
                const providers: TAuthProvider[] = data.allowedProviders ?? allowedProviders;
                setInviteCode(data.code ?? null);
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
                void fetchInviteHistory();
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

    /**
     * Закрывает текущую многоразовую ссылку, чтобы по ней больше нельзя было войти.
     */
    const handleRevokeInvite = async () => {
        if (!inviteCode) return;
        setRevokeLoading(true);
        try {
            const response = await APIRevokeInvite(inviteCode);
            if (response.ok) {
                setInviteRevoked(true);
                void fetchInviteHistory();
            } else {
                alert('Не удалось закрыть ссылку');
            }
        } catch (err) {
            console.error(err);
            alert('Произошла ошибка');
        } finally {
            setRevokeLoading(false);
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

    if (authStatus === 'loading' || loading) {
        return (
            <div className={css.loading}>
                <DelayedLoader active fullScreen={false} reserveSpace />
            </div>
        );
    }
    if (error) return <div className={css.error}>{error}</div>;

    const visibleUsers = users.filter((person) => {
        if (roleFilter !== 'all' && person.role !== roleFilter) {
            return false;
        }
        const needle = query.trim().toLowerCase();
        if (!needle) {
            return true;
        }
        const haystack = [
            person.first_name,
            person.last_name,
            person.username,
            person.bandName,
            person.emailLogin,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(needle);
    });

    const personName = (person: IUser) =>
        [person.first_name, person.last_name].filter(Boolean).join(' ').trim() || 'Без имени';

    return (
        <div className={css.adminPage}>
            <div className={css.shell}>
            <div className={css.header}>
                <button className={css.backButton} onClick={() => navigate('/app')}>
                    Назад
                </button>
                <h2>Управление пользователями</h2>
                {user && isSuperAdmin(user.role) ? (
                    <Link className={css.musicAdminLink} to="/admin/music">Музыка</Link>
                ) : null}
            </div>
            <div className={css.inviteSection}>
                <button
                    className={css.inviteButton}
                    onClick={openInviteOptions}
                    disabled={inviteLoading}
                >
                    {inviteLoading ? 'Генерация...' : 'Пригласить пользователя'}
                </button>
                {(inviteLive.length > 0 || inviteHistory.length > 0) && (
                    <div className={css.inviteHistory}>
                        {inviteLive.length > 0 && (
                            <>
                                <p className={css.inviteHistoryTitle}>Живые ссылки</p>
                                <ul className={css.inviteHistoryList}>
                                    {inviteLive.map((item) => (
                                        <li key={item.code}>
                                            <code>{item.code.slice(0, 8)}…</code>
                                            {item.multiUse
                                                ? ` · многоразовая (${item.useCount})`
                                                : ' · одноразовая'}
                                            {' · до '}
                                            {new Date(item.expiresAt).toLocaleDateString('ru-RU')}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                        {inviteHistory.length > 0 && (
                            <>
                                <p className={css.inviteHistoryTitle}>История</p>
                                <ul className={css.inviteHistoryList}>
                                    {inviteHistory.slice(0, 10).map((item) => (
                                        <li key={item.code}>
                                            <code>{item.code.slice(0, 8)}…</code>
                                            {item.revokedAt
                                                ? ' · отозвана'
                                                : item.usedAt
                                                  ? ' · использована'
                                                  : ''}
                                        </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                )}
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
                    <label>
                        <input
                            type="checkbox"
                            checked={inviteMultiUse}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                setInviteMultiUse(checked);
                                if (checked) setInviteInitialRole('user');
                            }}
                        />
                        {' '}Ссылка для общего чата
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
                        {inviteMultiUse
                            ? 'Ссылку можно отправить в общий чат. По ней пройдёт несколько человек, пока вы её не закроете. Сама она погаснет через 7 дней.'
                            : 'Отправьте одноразовую ссылку пользователю. После использования ссылка станет недействительной.'}
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
                    {inviteMultiUse && inviteCode && !inviteRevoked && (
                        <button
                            className={css.copyButton}
                            onClick={handleRevokeInvite}
                            disabled={revokeLoading}
                        >
                            {revokeLoading ? 'Закрытие...' : 'Закрыть ссылку'}
                        </button>
                    )}
                    {inviteRevoked && (
                        <p className={css.inviteDescription}>Ссылка закрыта. Новые регистрации по ней не проходят.</p>
                    )}
                    <button
                        className={css.closeModalButton}
                        onClick={() => setIsInviteModalOpen(false)}
                    >
                        Закрыть
                    </button>
                </div>
            </ModalPopup>

            <div className={css.filters}>
                <input
                    className={css.search}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Имя, username, коллектив"
                    aria-label="Поиск пользователей"
                />
                <select
                    className={css.roleSelect}
                    aria-label="Фильтр по роли"
                    value={roleFilter}
                    onChange={(event) => setRoleFilter(event.target.value as 'all' | TRole)}
                >
                    <option value="all">Все роли</option>
                    {(Object.keys(ROLE_LABELS) as TRole[]).map((role) => (
                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                    ))}
                </select>
            </div>

            {!user ? null : visibleUsers.length === 0 ? (
                <p className={css.inviteDescription}>Никого не нашли.</p>
            ) : (
                <div className={css.userGrid}>
                    {visibleUsers.map((person) => (
                        <UserCard
                            key={person._id}
                            person={person}
                            actor={user}
                            menuOpen={openMenuId === person._id}
                            roleLogOpen={roleLogUserId === person._id}
                            roleLogLoading={roleLogLoading && roleLogUserId === person._id}
                            roleLogEntries={roleLogUserId === person._id ? roleLogEntries : []}
                            emailFormOpen={emailLoginUserId === person._id}
                            emailLoading={emailLoginLoading}
                            onToggleMenu={() => {
                                setOpenMenuId((current) => (current === person._id ? null : person._id || null));
                            }}
                            onToggleRoleLog={() => toggleRoleLog(person._id || '')}
                            onToggleEmail={() => {
                                setEmailLoginUserId((current) => (
                                    current === person._id ? null : person._id || null
                                ));
                            }}
                            onRolePick={(nextRole) => {
                                if (!person._id || nextRole === person.role) {
                                    return;
                                }
                                setRoleConfirm({
                                    id: person._id,
                                    name: personName(person),
                                    from: person.role,
                                    to: nextRole,
                                });
                            }}
                            onAskDelete={() => {
                                if (!person._id) {
                                    return;
                                }
                                setDeleteConfirm({
                                    id: person._id,
                                    name: personName(person),
                                    role: person.role,
                                });
                            }}
                            onSubmitEmail={(email, password) => handleSetEmailLogin(
                                person._id || '',
                                person.role,
                                email,
                                password,
                            )}
                        />
                    ))}
                </div>
            )}

            <ModalPopup isOpen={roleConfirm !== null} onClose={() => setRoleConfirm(null)}>
                {roleConfirm ? (
                    <div role="dialog" aria-modal="true" aria-labelledby="role-confirm-title">
                        <h3 id="role-confirm-title">
                            Назначить роль «{ROLE_LABELS[roleConfirm.to]}» пользователю {roleConfirm.name}?
                        </h3>
                        <div className={css.confirmActions}>
                            <button
                                type="button"
                                className={css.copyButton}
                                onClick={() => {
                                    const pending = roleConfirm;
                                    setRoleConfirm(null);
                                    void handleRoleChange(pending.id, pending.to, pending.from);
                                }}
                            >
                                Назначить
                            </button>
                            <button type="button" className={css.closeModalButton} onClick={() => setRoleConfirm(null)}>
                                Отмена
                            </button>
                        </div>
                    </div>
                ) : null}
            </ModalPopup>

            <ModalPopup isOpen={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)}>
                {deleteConfirm ? (
                    <div role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
                        <h3 id="delete-confirm-title">Удалить пользователя {deleteConfirm.name}?</h3>
                        <p className={css.inviteDescription}>Это нельзя отменить.</p>
                        <div className={css.confirmActions}>
                            <button
                                type="button"
                                className={css.deleteButton}
                                onClick={() => {
                                    const pending = deleteConfirm;
                                    setDeleteConfirm(null);
                                    void handleDeleteUser(pending.id, pending.role);
                                }}
                            >
                                Удалить
                            </button>
                            <button type="button" className={css.closeModalButton} onClick={() => setDeleteConfirm(null)}>
                                Отмена
                            </button>
                        </div>
                    </div>
                ) : null}
            </ModalPopup>
            </div>
        </div>
    );
};
