import { describe, it, expect } from 'vitest';
import { canAssignRole, canDeleteUser } from './rolePermissions.ts';
import { assignRoleMatrix, deleteRoleMatrix } from '../../shared/test/roleMatrix.ts';

describe('rolePermissions', () => {
    describe('canAssignRole', () => {
        it.each(assignRoleMatrix)(
            '$actor → $newRole on $target = $expected',
            ({ actor, target, newRole, expected }) => {
                expect(canAssignRole(actor, target, newRole)).toBe(expected);
            },
        );
    });

    describe('canDeleteUser', () => {
        it.each(deleteRoleMatrix)(
            '$actor deletes $target = $expected',
            ({ actor, target, expected }) => {
                expect(canDeleteUser(actor, target, false)).toBe(expected);
            },
        );
    });
});
