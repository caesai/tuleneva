import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { signAuthToken, buildAuthResponse } from '../../auth/tokenService.js';

const SECRET = 'unit-test-secret';

describe('tokenService', () => {
    const user = {
        _id: '507f1f77bcf86cd799439011',
        first_name: 'Test',
        role: 'user',
        toObject() {
            return { _id: this._id, first_name: this.first_name, role: this.role };
        },
    };

    it('signAuthToken includes userId and role', () => {
        const token = signAuthToken(user, SECRET);
        const decoded = jwt.verify(token, SECRET);
        expect(decoded.userId).toBe(user._id);
        expect(decoded.role).toBe('user');
    });

    it('buildAuthResponse shapes session payload', () => {
        const token = signAuthToken(user, SECRET);
        const res = buildAuthResponse(user, token, 'telegram');
        expect(res.valid).toBe(true);
        expect(res.token).toBe(token);
        expect(res.authProvider).toBe('telegram');
        expect(res.user.isRegistered).toBe(true);
    });

    it('buildAuthResponse sets isRegistered false without token', () => {
        const res = buildAuthResponse(user, null, 'telegram');
        expect(res.token).toBeNull();
        expect(res.user.isRegistered).toBe(false);
    });
});
