/**
 * Решётка ролей: assign / delete / admin-like.
 * Один runtime для сервера (require) и клиента (Vite).
 * CommonJS (.cjs): корневой package.json — "type": "module".
 */

/** @description Роли с правами админки. */
const ADMIN_LIKE_ROLES = Object.freeze(['admin', 'super_admin']);

/** @description Все допустимые роли пользователя. */
const ALL_ROLES = Object.freeze(['super_admin', 'admin', 'user', 'guest']);

/**
 * Админ или супер-админ.
 * @param {string|undefined|null} role
 * @returns {boolean}
 */
const isAdminLike = (role) => Boolean(role && ADMIN_LIKE_ROLES.includes(role));

/**
 * Только супер-админ.
 * @param {string|undefined|null} role
 * @returns {boolean}
 */
const isSuperAdmin = (role) => role === 'super_admin';

/**
 * Может ли actor назначить newRole пользователю с текущей ролью targetCurrentRole.
 * @param {string} actorRole
 * @param {string} targetCurrentRole
 * @param {string} newRole
 * @returns {boolean}
 */
const canAssignRole = (actorRole, targetCurrentRole, newRole) => {
    if (!isAdminLike(actorRole)) return false;
    if (!ALL_ROLES.includes(newRole)) return false;

    if (actorRole === 'super_admin') {
        return true;
    }

    if (actorRole === 'admin') {
        if (!['guest', 'user'].includes(newRole)) return false;
        if (['admin', 'super_admin'].includes(targetCurrentRole)) return false;
        return true;
    }

    return false;
};

/**
 * Может ли actor удалить цель с ролью targetRole.
 * @param {string} actorRole
 * @param {string} targetRole
 * @param {boolean} isSelf - Удаление собственной учётки
 * @returns {boolean}
 */
const canDeleteByRole = (actorRole, targetRole, isSelf) => {
    if (!isAdminLike(actorRole) || isSelf) return false;
    if (actorRole === 'admin' && ['admin', 'super_admin'].includes(targetRole)) {
        return false;
    }
    return true;
};

/** @description Порядок ролей в UI (как раньше на клиенте). */
const ASSIGNABLE_ORDER = Object.freeze(['guest', 'user', 'admin', 'super_admin']);

/**
 * Роли, которые actor может назначить цели с текущей targetRole.
 * @param {string} actorRole
 * @param {string} targetRole
 * @returns {string[]}
 */
const getAssignableRoles = (actorRole, targetRole) => {
    return ASSIGNABLE_ORDER.filter((role) => canAssignRole(actorRole, targetRole, role));
};

module.exports = {
    ADMIN_LIKE_ROLES,
    ALL_ROLES,
    isAdminLike,
    isSuperAdmin,
    canAssignRole,
    canDeleteByRole,
    getAssignableRoles,
};
