import type { TRole } from '@/types/user.types.ts';

const ADMIN_LIKE: TRole[] = ['admin', 'super_admin'];

export const isAdminLike = (role?: TRole): boolean =>
    !!role && ADMIN_LIKE.includes(role);

export const isSuperAdmin = (role?: TRole): boolean => role === 'super_admin';

export const canAssignRole = (
    actorRole: TRole,
    targetRole: TRole,
    newRole: TRole,
): boolean => {
    if (!isAdminLike(actorRole)) return false;

    if (actorRole === 'super_admin') {
        return true;
    }

    if (actorRole === 'admin') {
        if (!['guest', 'user'].includes(newRole)) return false;
        if (['admin', 'super_admin'].includes(targetRole)) return false;
        return true;
    }

    return false;
};

export const getAssignableRoles = (actorRole: TRole, targetRole: TRole): TRole[] => {
    const all: TRole[] = ['guest', 'user', 'admin', 'super_admin'];
    return all.filter((role) => canAssignRole(actorRole, targetRole, role));
};

export const canDeleteUser = (
    actorRole: TRole,
    targetRole: TRole,
    isSelf: boolean,
): boolean => {
    if (!isAdminLike(actorRole) || isSelf) return false;
    if (actorRole === 'admin' && ['admin', 'super_admin'].includes(targetRole)) {
        return false;
    }
    return true;
};
