/**
 * Адаптер решётки ролей для сервера (Express / Telegraf).
 * Источник правил: shared/roleLattice.
 */
import {
    ALL_ROLES,
    isAdminLike,
    isStudioRole,
    isSuperAdmin,
    canAssignRole,
    canDeleteByRole,
    getAssignableRoles,
} from '../../shared/roleLattice';

/**
 * Может ли actor удалить targetUser (по _id и роли).
 * @param actorRole Роль действующего пользователя
 * @param targetUser Цель удаления
 * @param actorId Id действующего пользователя
 * @returns Разрешено ли удаление
 */
const canDeleteUser = (
    actorRole: string,
    targetUser: { _id: unknown; role: string },
    actorId: unknown,
): boolean => {
    const isSelf = String(targetUser._id) === String(actorId);
    return canDeleteByRole(actorRole, targetUser.role, isSelf);
};

export {
    isAdminLike,
    isStudioRole,
    isSuperAdmin,
    canAssignRole,
    canDeleteUser,
    getAssignableRoles,
    ALL_ROLES,
};
