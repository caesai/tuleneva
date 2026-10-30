import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRateLimiter } from '../../auth/rateLimit.js';

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
});
