import { describe, it, expect } from 'vitest';
import { canAssignRole, canDeleteUser, isStudioRole } from '../../auth/roleHelpers';
import { assignRoleMatrix, deleteRoleMatrix } from '../../../shared/test/roleMatrix';

describe('roleHelpers', () => {
    describe('isStudioRole', () => {
        it('accepts lattice roles and rejects anything else', () => {
            expect(isStudioRole('guest')).toBe(true);
            expect(isStudioRole('super_admin')).toBe(true);
            expect(isStudioRole('owner')).toBe(false);
            expect(isStudioRole(null)).toBe(false);
        });
    });

    describe('canAssignRole', () => {
        it.each(assignRoleMatrix)(
            '$actor assigns $newRole to user with role $target → $expected',
            ({ actor, target, newRole, expected }) => {
                expect(canAssignRole(actor, target, newRole)).toBe(expected);
            },
        );
    });

    describe('canDeleteUser', () => {
        it.each(deleteRoleMatrix)(
            '$actor deletes user with role $target → $expected',
            ({ actor, target, expected }) => {
                const targetUser = { _id: 'target-id', role: target };
                expect(canDeleteUser(actor, targetUser, 'actor-id')).toBe(expected);
            },
        );

        it('cannot delete self', () => {
            const user = { _id: 'same', role: 'admin' };
            expect(canDeleteUser('admin', user, 'same')).toBe(false);
        });
    });
});
