/**
 * @file Правила пропуска инвайта на лендинге и в Mini App различаются намеренно.
 */
import { describe, it, expect } from 'vitest';
import {
    readInviteCodeFromSearchParams,
    shouldSkipLandingInvite,
    shouldSkipTelegramStartInvite,
    showsWebInviteForm,
} from '@/auth/inviteEntry.ts';
import type { IUser } from '@/types/user.types.ts';

const user = (fields: Partial<IUser>): IUser => ({
    first_name: 'T',
    role: 'guest',
    ...fields,
});

describe('inviteEntry helpers', () => {
    it('reads invite code from query params', () => {
        expect(readInviteCodeFromSearchParams(new URLSearchParams('invite=abc'))).toBe('abc');
        expect(
            readInviteCodeFromSearchParams(new URLSearchParams('tgWebAppStartParam=start')),
        ).toBe('start');
        expect(readInviteCodeFromSearchParams(new URLSearchParams())).toBeNull();
    });

    it('landing skips when authenticated and isRegistered (including guest)', () => {
        expect(
            shouldSkipLandingInvite({
                isAuthenticated: true,
                user: user({ role: 'guest', isRegistered: true }),
            }),
        ).toBe(true);
        expect(
            shouldSkipLandingInvite({
                isAuthenticated: true,
                user: user({ role: 'user', isRegistered: true }),
            }),
        ).toBe(true);
        expect(
            shouldSkipLandingInvite({
                isAuthenticated: true,
                user: user({ role: 'guest', isRegistered: false }),
            }),
        ).toBe(false);
        expect(
            shouldSkipLandingInvite({ isAuthenticated: false, user: null }),
        ).toBe(false);
    });

    it('telegram start skips only non-guest members; guest still applies', () => {
        expect(
            shouldSkipTelegramStartInvite({
                isAuthenticated: true,
                user: user({ role: 'user' }),
            }),
        ).toBe(true);
        expect(
            shouldSkipTelegramStartInvite({
                isAuthenticated: true,
                user: user({ role: 'guest', isRegistered: true }),
            }),
        ).toBe(false);
        expect(
            shouldSkipTelegramStartInvite({
                isAuthenticated: false,
                user: null,
            }),
        ).toBe(false);
    });

    it('shows web form only outside Telegram when web is allowed', () => {
        expect(
            showsWebInviteForm({ isInTelegram: false, allowedProviders: ['web'] }),
        ).toBe(true);
        expect(
            showsWebInviteForm({ isInTelegram: true, allowedProviders: ['web'] }),
        ).toBe(false);
        expect(
            showsWebInviteForm({ isInTelegram: false, allowedProviders: ['telegram'] }),
        ).toBe(false);
    });
});
