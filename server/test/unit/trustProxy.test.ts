/**
 * @file Разбор TRUST_PROXY: пусто — loopback, числовая строка — число хопов.
 */
import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { resolveTrustProxy } from '../../config/trustProxy';

describe('resolveTrustProxy', () => {
    it('defaults to loopback', () => {
        expect(resolveTrustProxy(undefined)).toBe('loopback');
        expect(resolveTrustProxy('')).toBe('loopback');
        expect(resolveTrustProxy('  ')).toBe('loopback');
    });

    it('keeps named and address lists as strings', () => {
        expect(resolveTrustProxy('loopback')).toBe('loopback');
        expect(resolveTrustProxy(' 127.0.0.1, ::1 ')).toBe('127.0.0.1, ::1');
    });

    it('turns a hop count into a number and booleans into booleans', () => {
        expect(resolveTrustProxy('1')).toBe(1);
        expect(resolveTrustProxy('0')).toBe(0);
        expect(resolveTrustProxy('true')).toBe(true);
        expect(resolveTrustProxy('FALSE')).toBe(false);
    });

    it('accepts a numeric hop count as an Express trust proxy setting', async () => {
        const app = express();
        app.set('trust proxy', resolveTrustProxy('1'));
        app.get('/ip', (req, res) => {
            res.json({ ip: req.ip });
        });

        const res = await request(app).get('/ip').set('X-Forwarded-For', '203.0.113.10');
        expect(res.status).toBe(200);
        expect(res.body.ip).toBe('203.0.113.10');
    });
});
