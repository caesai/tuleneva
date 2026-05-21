import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import request from 'supertest';
import InviteCode from '../../models/InviteCode.js';
import User from '../../models/User.js';
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

describe('invite integration', () => {
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

    it('web happy path: generate → validate → use → reuse fails', async () => {
        const admin = await seedUser({ role: 'admin' });

        const gen = await request(app)
            .post('/api/auth/invite/generate')
            .set(authHeader(admin))
            .send({ allowedProviders: ['web'] });
        expect(gen.status).toBe(201);
        const { code } = gen.body;

        const validate = await request(app).get(`/api/auth/invite/validate/${code}`);
        expect(validate.body.valid).toBe(true);

        const use1 = await request(app)
            .post('/api/auth/invite/use')
            .send({ code, provider: 'web', web: { firstName: 'Alice' } });
        expect(use1.status).toBe(201);
        expect(use1.body.token).toBeTruthy();
        expect(use1.body.user.identities?.[0]?.provider).toBe('web');

        const use2 = await request(app)
            .post('/api/auth/invite/use')
            .send({ code, provider: 'web', web: { firstName: 'Bob' } });
        expect(use2.status).toBe(400);

        const doc = await InviteCode.findOne({ code });
        expect(doc?.usedAt).toBeTruthy();
    });

    it('provider mismatch does not consume invite', async () => {
        const admin = await seedUser({ role: 'admin' });
        const gen = await request(app)
            .post('/api/auth/invite/generate')
            .set(authHeader(admin))
            .send({ allowedProviders: ['telegram'] });
        const { code } = gen.body;

        const res = await request(app)
            .post('/api/auth/invite/use')
            .send({ code, provider: 'web', web: { firstName: 'X' } });
        expect(res.status).toBe(400);

        const doc = await InviteCode.findOne({ code });
        expect(doc?.usedAt).toBeFalsy();
    });

    it('expired invite validates as false', async () => {
        const admin = await seedUser({ role: 'admin' });
        await InviteCode.create({
            code: 'old-invite',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() - 5000),
            allowedProviders: ['web'],
        });

        const res = await request(app).get('/api/auth/invite/validate/old-invite');
        expect(res.body.valid).toBe(false);
    });

    it('telegram invite creates user with telegram_id', async () => {
        const admin = await seedUser({ role: 'admin' });
        const initData = buildInitData(
            { id: 424242, first_name: 'Tele', username: 'tele_user' },
            BOT_TOKEN,
        );

        const gen = await request(app)
            .post('/api/auth/invite/generate')
            .set(authHeader(admin))
            .send({ allowedProviders: ['telegram'] });

        const res = await request(app)
            .post('/api/auth/invite/use')
            .send({
                code: gen.body.code,
                provider: 'telegram',
                telegram: { user: initData },
            });

        expect(res.status).toBe(201);
        const user = await User.findOne({ telegram_id: 424242 });
        expect(user).toBeTruthy();
    });
});
