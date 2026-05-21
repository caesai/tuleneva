import React, { useEffect, useState } from 'react';
import { APIGetUsers, APIUpdateUserRole, APIDeleteUser, APIGenerateInvite } from '@/api/user.api.ts';
import type { IUser, TRole } from '@/types/user.types.ts';
import { Loader } from '@/components/Loader/Loader.tsx';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';
import css from './AdminPage.module.css';
import { useAuth } from '@/hooks/useAuth.ts';
import { useNavigate } from 'react-router-dom';

/**
 * Страница администратора для управления пользователями.
 * Позволяет просматривать список пользователей, изменять их роли и удалять пользователей.
 * Доступна только пользователям с ролью 'admin'.
 *
 * @component
 */
export const AdminPage: React.FC = () => {
    const [users, setUsers] = useState<IUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
    const [inviteLink, setInviteLink] = useState<string | null>(null);
    const [webInviteLink, setWebInviteLink] = useState<string | null>(null);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const { user } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        // Проверка прав доступа (на всякий случай, хотя роутинг тоже должен защищать)
        if ( user && (user.role !== 'admin' && user?.role !== 'super_admin')) {
            navigate('/');
            return;
        }

        fetchUsers();
    }, [user, navigate]);

    const fetchUsers = async () => {
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
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            const response = await APIUpdateUserRole(userId || '', newRole);
            if (response.ok) {
                // Обновляем локальное состояние
                setUsers(users.map(u => u._id === userId ? { ...u, role: newRole as TRole } : u));
            } else {
                alert('Failed to update role');
            }
        } catch (err) {
            console.error(err);
            alert('An error occurred');
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this user?')) return;

        try {
            const response = await APIDeleteUser(userId || '');
            if (response.ok) {
                setUsers(users.filter(u => u._id !== userId));
            } else {
                alert('Failed to delete user');
            }
        } catch (err) {
            console.error(err);
            alert('An error occurred');
        }
    };

    const handleGenerateInvite = async () => {
        setInviteLoading(true);
        setCopied(false);
        setInviteLink(null);
        setWebInviteLink(null);
        try {
            const response = await APIGenerateInvite();
            if (response.ok) {
                const data = await response.json();
                setInviteLink(data.telegramInviteLink || data.inviteLink);
                setWebInviteLink(data.webInviteLink || null);
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
            // Fallback для старых браузеров
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
                    onClick={handleGenerateInvite}
                    disabled={inviteLoading}
                >
                    {inviteLoading ? 'Генерация...' : 'Пригласить пользователя'}
                </button>
            </div>

            <ModalPopup isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)}>
                <div className={css.inviteModal}>
                    <h3>Пригласить пользователя</h3>
                    <p className={css.inviteDescription}>
                        Отправьте эту одноразовую ссылку пользователю. После использования ссылка станет недействительной.
                    </p>
                    {inviteLink && (
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
                    {webInviteLink && (
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
                        {users.map(u => (
                            <tr key={u._id}>
                                <td>{u.first_name} {u.last_name}</td>
                                <td>{u.username ? `@${u.username}` : '-'}</td>
                                <td>
                                    <select
                                        className={css.roleSelect}
                                        value={u.role}
                                        onChange={(e) => handleRoleChange(u._id || '', e.target.value)}
                                        disabled={u._id === user?._id} // Нельзя менять роль самому себе
                                    >
                                        <option value="guest">Гость</option>
                                        <option value="user">Пользователь</option>
                                        {user?.role === 'super_admin' && <option value="admin">Администратор</option>}
                                        {user?.role === 'super_admin' && <option value="super_admin">Супер администратор</option>}
                                    </select>
                                </td>
                                <td>
                                    <button
                                        className={css.deleteButton}
                                        onClick={() => handleDeleteUser(u._id || '')}
                                        disabled={u._id === user?._id} // Нельзя удалить самого себя
                                    >
                                        Удалить
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
