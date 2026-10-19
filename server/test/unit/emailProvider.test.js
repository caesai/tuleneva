import { describe, it, expect, beforeEach } from 'vitest';
import {
    normalizeEmail,
    validateEmailCredentials,
    hashPassword,
    verifyPassword,
    resetLoginAttemptsForTests,
    allowLoginAttempt,
    recordFailedLogin,
    MIN_PASSWORD_LENGTH,
} from '../../auth/emailProvider.js';

describe('emailProvider', () => {
    beforeEach(() => {
        resetLoginAttemptsForTests();
    });

    it('normalizeEmail lowercases and trims', () => {
        expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
    });

    it('validateEmailCredentials rejects short password', () => {
        expect(() => validateEmailCredentials('a@b.co', 'short')).toThrow(
            `Password must be at least ${MIN_PASSWORD_LENGTH}`,
        );
    });

    it('validateEmailCredentials rejects invalid email', () => {
        expect(() => validateEmailCredentials('not-an-email', 'password12')).toThrow(
            'Invalid email',
        );
    });

    it('hashPassword and verifyPassword round-trip', async () => {
        const hash = await hashPassword('password12');
        expect(hash).not.toBe('password12');
        expect(await verifyPassword('password12', hash)).toBe(true);
        expect(await verifyPassword('wrong', hash)).toBe(false);
    });

    it('login attempt limiter blocks after many failures', () => {
        const email = 'limit@test.com';
        for (let i = 0; i < 10; i += 1) {
            expect(allowLoginAttempt(email)).toBe(true);
            recordFailedLogin(email);
        }
        expect(allowLoginAttempt(email)).toBe(false);
    });
});
