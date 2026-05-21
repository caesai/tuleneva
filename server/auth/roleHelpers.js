/**
 * Server-side role permission helpers.
 */

const ADMIN_LIKE_ROLES = ['admin', 'super_admin'];
const ALL_ROLES = ['super_admin', 'admin', 'user', 'guest'];

const isAdminLike = (role) => ADMIN_LIKE_ROLES.includes(role);

const isSuperAdmin = (role) => role === 'super_admin';

/**
 * Whether actor may assign newRole to a user who currently has targetCurrentRole.
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
 * Whether actor may delete targetUser.
 */
const canDeleteUser = (actorRole, targetUser, actorId) => {
    if (!isAdminLike(actorRole)) return false;
    if (String(targetUser._id) === String(actorId)) return false;

    if (actorRole === 'admin' && ['admin', 'super_admin'].includes(targetUser.role)) {
        return false;
    }

    return true;
};

module.exports = {
    isAdminLike,
    isSuperAdmin,
    canAssignRole,
    canDeleteUser,
    ALL_ROLES,
};
