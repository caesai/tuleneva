/**
 * @file Адаптер решётки ролей для клиента (AdminPage).
 * Источник правил: shared/roleLattice.cjs.
 */
import type { TRole } from '@/types/user.types.ts';
import {
    isAdminLike as isAdminLikeShared,
    isSuperAdmin as isSuperAdminShared,
    canAssignRole as canAssignRoleShared,
    canDeleteByRole,
    getAssignableRoles as getAssignableRolesShared,
} from '../../shared/roleLattice.cjs';

/**
 * Админ или супер-админ.
 * @param role - Роль пользователя
 * @returns true для admin / super_admin
 */
export const isAdminLike = (role?: TRole): boolean => isAdminLikeShared(role);

/**
 * Только супер-админ.
 * @param role - Роль пользователя
 * @returns true для super_admin
 */
export const isSuperAdmin = (role?: TRole): boolean => isSuperAdminShared(role);

/**
 * Может ли actor назначить newRole цели с текущей targetRole.
 * @param actorRole - Роль инициатора
 * @param targetRole - Текущая роль цели
 * @param newRole - Новая роль
 * @returns Разрешено ли назначение
 */
export const canAssignRole = (
    actorRole: TRole,
    targetRole: TRole,
    newRole: TRole,
): boolean => canAssignRoleShared(actorRole, targetRole, newRole);

/**
 * Роли, доступные actor для назначения цели.
 * @param actorRole - Роль инициатора
 * @param targetRole - Текущая роль цели
 * @returns Список допустимых новых ролей
 */
export const getAssignableRoles = (actorRole: TRole, targetRole: TRole): TRole[] =>
    getAssignableRolesShared(actorRole, targetRole) as TRole[];

/**
 * Может ли actor удалить пользователя с targetRole.
 * @param actorRole - Роль инициатора
 * @param targetRole - Роль цели
 * @param isSelf - Удаление себя
 * @returns Разрешено ли удаление
 */
export const canDeleteUser = (
    actorRole: TRole,
    targetRole: TRole,
    isSelf: boolean,
): boolean => canDeleteByRole(actorRole, targetRole, isSelf);
