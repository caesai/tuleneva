/**
 * Типы для shared/roleLattice.cjs (клиентский TypeScript).
 */

export const ADMIN_LIKE_ROLES: readonly string[];
export const ALL_ROLES: readonly string[];

export function isAdminLike(role?: string | null): boolean;
export function isSuperAdmin(role?: string | null): boolean;
export function canAssignRole(
    actorRole: string,
    targetCurrentRole: string,
    newRole: string,
): boolean;
export function canDeleteByRole(
    actorRole: string,
    targetRole: string,
    isSelf: boolean,
): boolean;
export function getAssignableRoles(actorRole: string, targetRole: string): string[];
