import type { TRole } from '../../src/types/user.types.ts';

export interface RoleMatrixCase {
    actor: TRole;
    target: TRole;
    newRole: TRole;
    expected: boolean;
    action: 'assign' | 'delete';
}

/** Shared cases for canAssignRole (action: assign). */
export const assignRoleMatrix: RoleMatrixCase[] = [
    { actor: 'admin', target: 'guest', newRole: 'user', expected: true, action: 'assign' },
    { actor: 'admin', target: 'guest', newRole: 'admin', expected: false, action: 'assign' },
    { actor: 'admin', target: 'guest', newRole: 'super_admin', expected: false, action: 'assign' },
    { actor: 'admin', target: 'admin', newRole: 'user', expected: false, action: 'assign' },
    { actor: 'admin', target: 'super_admin', newRole: 'user', expected: false, action: 'assign' },
    { actor: 'super_admin', target: 'guest', newRole: 'admin', expected: true, action: 'assign' },
    { actor: 'super_admin', target: 'guest', newRole: 'super_admin', expected: true, action: 'assign' },
    { actor: 'user', target: 'guest', newRole: 'user', expected: false, action: 'assign' },
    { actor: 'guest', target: 'guest', newRole: 'user', expected: false, action: 'assign' },
];

/** Shared cases for canDeleteUser (action: delete). */
export const deleteRoleMatrix: RoleMatrixCase[] = [
    { actor: 'admin', target: 'guest', newRole: 'guest', expected: true, action: 'delete' },
    { actor: 'admin', target: 'super_admin', newRole: 'guest', expected: false, action: 'delete' },
    { actor: 'admin', target: 'admin', newRole: 'guest', expected: false, action: 'delete' },
    { actor: 'super_admin', target: 'guest', newRole: 'guest', expected: true, action: 'delete' },
    { actor: 'super_admin', target: 'super_admin', newRole: 'guest', expected: true, action: 'delete' },
];

export const roleMatrix: RoleMatrixCase[] = [...assignRoleMatrix, ...deleteRoleMatrix];
