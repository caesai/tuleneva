/**
 * @file 429 на маршрутах без лимита раньше и отдельное ведро на X-Forwarded-For.
 * Ответ лимита — `{ message }`, как у уже существующих лимитеров.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { RATE_LIMIT_PRESETS } from '../../auth/rateLimit';
import {
    connectTestDb,
    createTestApp,
    disconnectTestDb,
} from '../helpers/testApp';

describe('route rate limits', () => {
    beforeAll(async () => {
        await connectTestDb();
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    /**
     * Бьёт маршрут, пока лимит не ответит 429 `{ message }`.
     * @param method post или delete
     * @param path Путь
     * @param preset Имя пресета
     */
    const expectLimited = async (
        method: 'post' | 'delete',
        path: string,
        preset: keyof typeof RATE_LIMIT_PRESETS,
    ) => {
        const app = createTestApp();
        const { max, message } = RATE_LIMIT_PRESETS[preset];
        for (let i = 0; i < max; i += 1) {
            const res = await request(app)[method](path).send({});
            expect(res.status, `${method} ${path} #${i + 1}`).not.toBe(429);
        }
        const denied = await request(app)[method](path).send({});
        expect(denied.status).toBe(429);
        expect(denied.body).toEqual({ message });
    };

    it('limits email login, link, confirm, forgot and reset', async () => {
        await expectLimited('post', '/api/auth/providers/email/login', 'emailLogin');
        await expectLimited('post', '/api/auth/providers/email/link', 'emailLink');
        await expectLimited('post', '/api/auth/providers/email/confirm', 'emailConfirm');
        await expectLimited('post', '/api/auth/providers/email/forgot', 'emailForgot');
        await expectLimited('post', '/api/auth/providers/email/reset', 'emailReset');
    });

    it('limits telegram register and the legacy alias on one shared bucket', async () => {
        const app = createTestApp();
        const { max, message } = RATE_LIMIT_PRESETS.telegramRegister;
        for (let i = 0; i < max; i += 1) {
            const res = await request(app).post('/api/auth/providers/telegram/register').send({});
            expect(res.status).not.toBe(429);
        }
        const legacy = await request(app).post('/api/users/register').send({});
        expect(legacy.status).toBe(429);
        expect(legacy.body).toEqual({ message });
    });

    it('limits book and cancel', async () => {
        await expectLimited('post', '/api/book', 'book');
        await expectLimited('delete', '/api/cancel', 'cancel');
    });

    it('keys the forgot-password limit on the forwarded client IP', async () => {
        const previous = process.env.TRUST_PROXY;
        delete process.env.TRUST_PROXY;
        const app = createTestApp();
        if (previous === undefined) {
            delete process.env.TRUST_PROXY;
        } else {
            process.env.TRUST_PROXY = previous;
        }

        const { max, message } = RATE_LIMIT_PRESETS.emailForgot;
        const send = (forwardedFor: string) => request(app)
            .post('/api/auth/providers/email/forgot')
            .set('X-Forwarded-For', forwardedFor)
            .send({});

        for (let i = 0; i < max; i += 1) {
            expect((await send('203.0.113.10')).status).not.toBe(429);
        }
        const denied = await send('203.0.113.10');
        expect(denied.status).toBe(429);
        expect(denied.body).toEqual({ message });
        expect((await send('198.51.100.50, 203.0.113.10')).status).toBe(429);
        expect((await send('203.0.113.11')).status).not.toBe(429);
    });
});
