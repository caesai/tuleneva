/**
 * @file Просроченный JWT не должен уходить на `/api/auth/session`.
 */
import { describe, it, expect } from 'vitest';
import { isJwtUnusable } from '@/auth/jwtExpiry.ts';

const tokenWithExp = (exp: number) => {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify({ exp, userId: '1' }));
    return `${header}.${body}.sig`;
};

describe('isJwtUnusable', () => {
    const now = Date.parse('2026-11-10T12:00:00Z');

    it('считает просроченный токен непригодным', () => {
        const exp = Math.floor(now / 1000) - 120;
        expect(isJwtUnusable(tokenWithExp(exp), now)).toBe(true);
    });

    it('оставляет токен с запасом по часам', () => {
        const exp = Math.floor(now / 1000) + 30;
        expect(isJwtUnusable(tokenWithExp(exp), now)).toBe(false);
    });

    it('не шлёт на сервер обрывок строки', () => {
        expect(isJwtUnusable('not-a-jwt', now)).toBe(true);
    });
});
