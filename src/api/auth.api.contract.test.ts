import { describe, it, expect } from 'vitest';
import { AuthSessionResponseSchema } from '../../shared/contracts/auth.ts';
import { parseAuthResponse } from './auth.api.ts';

describe('auth.api contracts', () => {
    it('parseAuthResponse result satisfies AuthSessionResponseSchema', async () => {
        const fixture = {
            valid: true,
            token: 'jwt-token',
            authProvider: 'web' as const,
            user: {
                _id: 'abc',
                first_name: 'Web',
                role: 'guest' as const,
                isRegistered: true,
            },
        };

        const response = new Response(JSON.stringify(fixture), { status: 200 });
        const data = await parseAuthResponse(response);
        expect(() => AuthSessionResponseSchema.parse(data)).not.toThrow();
    });
});
