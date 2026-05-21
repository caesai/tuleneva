import { describe, it, expect } from 'vitest';
import { canAssignRole, canDeleteUser } from '../../auth/roleHelpers.js';
import { assignRoleMatrix, deleteRoleMatrix } from '../../../shared/test/roleMatrix.ts';

describe('roleHelpers', () => {
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
