/**
 * Решётка ролей: assign / delete / admin-like.
 * Один runtime для сервера и клиента (Vite).
 */

/** @description Роли с правами админки. */
export const ADMIN_LIKE_ROLES = Object.freeze(['admin', 'super_admin'] as const);

/** @description Все допустимые роли пользователя. */
export const ALL_ROLES = Object.freeze(['super_admin', 'admin', 'user', 'guest'] as const);

/**
 * Админ или супер-админ.
 * @param role Роль пользователя
 * @returns true, если роль admin или super_admin
 */
export const isAdminLike = (role?: string | null): boolean =>
    Boolean(role && (ADMIN_LIKE_ROLES as readonly string[]).includes(role));

/**
 * Только супер-админ.
 * @param role Роль пользователя
 * @returns true, если роль super_admin
 */
export const isSuperAdmin = (role?: string | null): boolean => role === 'super_admin';

/**
 * Может ли actor назначить newRole пользователю с текущей ролью targetCurrentRole.
 * @param actorRole Роль действующего пользователя
 * @param targetCurrentRole Текущая роль цели
 * @param newRole Назначаемая роль
 * @returns Разрешено ли назначение
 */
export const canAssignRole = (
    actorRole: string,
    targetCurrentRole: string,
    newRole: string,
): boolean => {
    if (!isAdminLike(actorRole)) return false;
    if (!(ALL_ROLES as readonly string[]).includes(newRole)) return false;

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
 * @param actorRole Роль действующего пользователя
 * @param targetRole Роль цели
 * @param isSelf Удаление собственной учётки
 * @returns Разрешено ли удаление
 */
export const canDeleteByRole = (
    actorRole: string,
    targetRole: string,
    isSelf: boolean,
): boolean => {
    if (!isAdminLike(actorRole) || isSelf) return false;
    if (actorRole === 'admin' && ['admin', 'super_admin'].includes(targetRole)) {
        return false;
    }
    return true;
};

/** @description Порядок ролей в UI (как раньше на клиенте). */
const ASSIGNABLE_ORDER = Object.freeze(['guest', 'user', 'admin', 'super_admin'] as const);

/**
 * Роли, которые actor может назначить цели с текущей targetRole.
 * @param actorRole Роль действующего пользователя
 * @param targetRole Текущая роль цели
 * @returns Список допустимых ролей для назначения
 */
export const getAssignableRoles = (actorRole: string, targetRole: string): string[] => {
    return ASSIGNABLE_ORDER.filter((role) => canAssignRole(actorRole, targetRole, role));
};
