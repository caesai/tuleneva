/**
 * Адаптер решётки ролей для сервера (Express / Telegraf).
 * Источник правил: shared/roleLattice.
 */
import {
    ALL_ROLES,
    isAdminLike,
    isSuperAdmin,
    canAssignRole,
    canDeleteByRole,
    getAssignableRoles,
} from '../../shared/roleLattice';

/**
 * Может ли actor удалить targetUser (по _id и роли).
 * @param {string} actorRole
 * @param {{ _id: unknown, role: string }} targetUser
 * @param {unknown} actorId
 * @returns {boolean}
 */
const canDeleteUser = (actorRole, targetUser, actorId) => {
    const isSelf = String(targetUser._id) === String(actorId);
    return canDeleteByRole(actorRole, targetUser.role, isSelf);
};

export {
    isAdminLike,
    isSuperAdmin,
    canAssignRole,
    canDeleteUser,
    getAssignableRoles,
    ALL_ROLES,
};
