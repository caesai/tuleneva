import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import request from 'supertest';
import InviteCode from '../../models/InviteCode.js';
import {
    AuthSessionResponseSchema,
    InviteValidateResponseSchema,
    InviteGenerateResponseSchema,
} from '../../../shared/contracts/auth.ts';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    createTestApp,
    seedUser,
    authHeader,
    BOT_TOKEN,
} from '../helpers/testApp.js';
import { buildInitData } from '../fixtures/buildInitData.js';

describe('auth API contracts', () => {
    let app;

    beforeAll(async () => {
        await connectTestDb();
        app = createTestApp();
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
    });

    it('GET /api/auth/session matches AuthSessionResponseSchema', async () => {
        const user = await seedUser({ role: 'user' });
        const res = await request(app)
            .get('/api/auth/session')
            .set(authHeader(user));

        expect(res.status).toBe(200);
        expect(() => AuthSessionResponseSchema.parse(res.body)).not.toThrow();
    });

    it('GET /api/auth/invite/validate/:code matches InviteValidateResponseSchema', async () => {
        const admin = await seedUser({ role: 'admin' });
        await InviteCode.create({
            code: 'contract-code',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() + 3600000),
            allowedProviders: ['web'],
        });

        const res = await request(app).get('/api/auth/invite/validate/contract-code');
        expect(res.status).toBe(200);
        expect(() => InviteValidateResponseSchema.parse(res.body)).not.toThrow();
    });

    it('POST /api/auth/invite/generate matches InviteGenerateResponseSchema', async () => {
        const admin = await seedUser({ role: 'admin' });
        const res = await request(app)
            .post('/api/auth/invite/generate')
            .set(authHeader(admin))
            .send({ allowedProviders: ['web', 'telegram'] });

        expect(res.status).toBe(201);
        expect(() => InviteGenerateResponseSchema.parse(res.body)).not.toThrow();
    });

    it('POST /api/auth/invite/use response matches AuthSessionResponseSchema', async () => {
        const admin = await seedUser({ role: 'admin' });
        await InviteCode.create({
            code: 'use-contract',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() + 3600000),
            allowedProviders: ['web'],
        });

        const res = await request(app)
            .post('/api/auth/invite/use')
            .send({
                code: 'use-contract',
                provider: 'web',
                web: { firstName: 'WebUser' },
            });

        expect(res.status).toBe(201);
        expect(() => AuthSessionResponseSchema.parse(res.body)).not.toThrow();
        expect(res.body.authProvider).toBe('web');
    });

    it('POST /api/auth/invite/use telegram matches schema', async () => {
        const admin = await seedUser({ role: 'admin' });
        const initData = buildInitData(
            { id: 999001, first_name: 'Tg', username: 'tguser' },
            BOT_TOKEN,
        );
        await InviteCode.create({
            code: 'tg-contract',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() + 3600000),
            allowedProviders: ['telegram'],
        });

        const res = await request(app)
            .post('/api/auth/invite/use')
            .send({
                code: 'tg-contract',
                provider: 'telegram',
                telegram: { user: initData },
            });

        expect(res.status).toBe(201);
        expect(() => AuthSessionResponseSchema.parse(res.body)).not.toThrow();
    });
});
