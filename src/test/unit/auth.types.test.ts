import { describe, it, expect } from 'vitest';
import type { IUser } from '@/types/user.types.ts';
import { buildAuthCapabilities, resolveAuthStatus } from '@/types/auth.types.ts';

const baseUser = (role: IUser['role']): IUser => ({
    _id: '1',
    first_name: 'Test',
    role,
    isRegistered: role !== 'guest',
});

describe('auth.types', () => {
    describe('buildAuthCapabilities', () => {
        it('guest authenticated cannot manage bookings', () => {
            const caps = buildAuthCapabilities(baseUser('guest'), true);
            expect(caps.canManageBookings).toBe(false);
            expect(caps.isGuest).toBe(true);
        });

        it('user can manage bookings when authenticated', () => {
            const caps = buildAuthCapabilities(baseUser('user'), true);
            expect(caps.canManageBookings).toBe(true);
            expect(caps.isAdmin).toBe(false);
        });

        it('admin has admin flag only with a live session', () => {
            const caps = buildAuthCapabilities(baseUser('admin'), true);
            expect(caps.isAdmin).toBe(true);
            expect(caps.isSuperAdmin).toBe(false);
            expect(buildAuthCapabilities(baseUser('admin'), false).isAdmin).toBe(false);
        });

        it('super_admin flag requires a session', () => {
            expect(buildAuthCapabilities(baseUser('super_admin'), true).isSuperAdmin).toBe(true);
            expect(buildAuthCapabilities(baseUser('super_admin'), false).isSuperAdmin).toBe(false);
        });
    });

    describe('resolveAuthStatus', () => {
        it('loading when isLoading', () => {
            expect(resolveAuthStatus(true, false, null)).toBe('loading');
        });

        it('anonymous without user', () => {
            expect(resolveAuthStatus(false, false, null)).toBe('anonymous');
        });

        it('guest_pending for unauthenticated guest', () => {
            expect(resolveAuthStatus(false, false, baseUser('guest'))).toBe('guest_pending');
        });

        it('authenticated when token present', () => {
            expect(resolveAuthStatus(false, true, baseUser('user'))).toBe('authenticated');
        });
    });
});
