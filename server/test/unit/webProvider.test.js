import { describe, it, expect } from 'vitest';
import { parseWebProfile } from '../../auth/webProvider.js';

describe('webProvider', () => {
    describe('parseWebProfile', () => {
        it('requires first name', () => {
            expect(() => parseWebProfile({})).toThrow('First name is required');
        });

        it('trims name and email', () => {
            const profile = parseWebProfile({
                firstName: '  Alice  ',
                email: '  Test@Example.COM  ',
            });
            expect(profile.firstName).toBe('Alice');
            expect(profile.email).toBe('test@example.com');
        });

        it('accepts snake_case fields', () => {
            const profile = parseWebProfile({ first_name: 'Bob', last_name: 'Smith' });
            expect(profile.firstName).toBe('Bob');
            expect(profile.lastName).toBe('Smith');
        });

        it('allows missing email (UUID path)', () => {
            const profile = parseWebProfile({ firstName: 'NoEmail' });
            expect(profile.email).toBeNull();
        });
    });
});
