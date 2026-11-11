import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRateLimiter } from '../../auth/rateLimit';

describe('createRateLimiter', () => {
    let app;
    let limiter;

    beforeEach(() => {
        limiter = createRateLimiter({ windowMs: 60_000, max: 2, message: 'Too many' });
        app = express();
        app.post('/limited', limiter, (_req, res) => {
            res.status(200).json({ ok: true });
        });
    });

    it('allows requests under the limit', async () => {
        const a = await request(app).post('/limited');
        const b = await request(app).post('/limited');
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
    });

    it('returns 429 when limit exceeded', async () => {
        await request(app).post('/limited');
        await request(app).post('/limited');
        const denied = await request(app).post('/limited');
        expect(denied.status).toBe(429);
        expect(denied.body.message).toBe('Too many');
    });

    it('reset clears counters', async () => {
        await request(app).post('/limited');
        await request(app).post('/limited');
        expect((await request(app).post('/limited')).status).toBe(429);
        limiter.reset();
        expect((await request(app).post('/limited')).status).toBe(200);
    });

    it('keys on the forwarded client IP when the loopback proxy is trusted', async () => {
        const trusted = express();
        trusted.set('trust proxy', 'loopback');
        trusted.post('/limited', limiter, (_req, res) => {
            res.status(200).json({ ok: true });
        });

        const send = (forwardedFor: string) => request(trusted)
            .post('/limited')
            .set('X-Forwarded-For', forwardedFor);

        expect((await send('203.0.113.10')).status).toBe(200);
        expect((await send('203.0.113.10')).status).toBe(200);
        expect((await send('203.0.113.10')).status).toBe(429);
        expect((await send('198.51.100.50, 203.0.113.10')).status).toBe(429);
        expect((await send('203.0.113.11')).status).toBe(200);
    });

    it('shares one bucket for every X-Forwarded-For when the proxy is not trusted', async () => {
        const open = express();
        open.post('/limited', limiter, (_req, res) => {
            res.status(200).json({ ok: true });
        });

        const send = (forwardedFor: string) => request(open)
            .post('/limited')
            .set('X-Forwarded-For', forwardedFor);

        expect((await send('203.0.113.10')).status).toBe(200);
        expect((await send('203.0.113.10')).status).toBe(200);
        expect((await send('203.0.113.11')).status).toBe(429);
    });
});
