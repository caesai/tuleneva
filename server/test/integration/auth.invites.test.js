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

    it('web invite with same claimed email creates two separate users', async () => {
        const admin = await seedUser({ role: 'admin' });
        const claimedEmail = 'taken@example.com';

        const gen1 = await request(app)
            .post('/api/auth/invite/generate')
            .set(authHeader(admin))
            .send({ allowedProviders: ['web'] });
        const gen2 = await request(app)
            .post('/api/auth/invite/generate')
            .set(authHeader(admin))
            .send({ allowedProviders: ['web'] });

        const use1 = await request(app)
            .post('/api/auth/invite/use')
            .send({
                code: gen1.body.code,
                provider: 'web',
                web: { firstName: 'Alice', email: claimedEmail },
            });
        expect(use1.status).toBe(201);
        expect(use1.body.user._id).toBeTruthy();

        const use2 = await request(app)
            .post('/api/auth/invite/use')
            .send({
                code: gen2.body.code,
                provider: 'web',
                web: { firstName: 'Eve', email: claimedEmail },
            });
        expect(use2.status).toBe(201);
        expect(use2.body.user._id).toBeTruthy();
        expect(use2.body.user._id).not.toBe(use1.body.user._id);

        const webUsers = await User.find({
            'identities.provider': 'web',
        });
        expect(webUsers).toHaveLength(2);

        for (const user of webUsers) {
            const webIdentity = user.identities.find((i) => i.provider === 'web');
            expect(webIdentity).toBeTruthy();
            expect(webIdentity.verifiedAt).toBeUndefined();
            expect(webIdentity.email).toBeUndefined();
            expect(webIdentity.providerUserId).not.toBe(claimedEmail);
            expect(webIdentity.providerUserId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            );
        }
    });

    it('multi-use web invite accepts two people and stops after revoke', async () => {
        const admin = await seedUser({ role: 'admin' });
        const gen = await request(app)
            .post('/api/auth/invite/generate')
            .set(authHeader(admin))
            .send({
                allowedProviders: ['web'],
                multiUse: true,
                initialRole: 'user',
            });
        expect(gen.status).toBe(201);
        expect(gen.body.multiUse).toBe(true);
        const { code } = gen.body;

        const use1 = await request(app)
            .post('/api/auth/invite/use')
            .send({ code, provider: 'web', web: { firstName: 'Alice' } });
        const use2 = await request(app)
            .post('/api/auth/invite/use')
            .send({ code, provider: 'web', web: { firstName: 'Bob' } });
        expect(use1.status).toBe(201);
        expect(use2.status).toBe(201);
        expect(use1.body.user.role).toBe('user');
        expect(use2.body.user._id).not.toBe(use1.body.user._id);

        const stillValid = await request(app).get(`/api/auth/invite/validate/${code}`);
        expect(stillValid.body.valid).toBe(true);

        const guest = await seedUser({ role: 'guest', first_name: 'NotAdmin' });
        const denied = await request(app)
            .post('/api/auth/invite/revoke')
            .set(authHeader(guest))
            .send({ code });
        expect(denied.status).toBe(403);

        const revoke = await request(app)
            .post('/api/auth/invite/revoke')
            .set(authHeader(admin))
            .send({ code });
        expect(revoke.status).toBe(200);

        const use3 = await request(app)
            .post('/api/auth/invite/use')
            .send({ code, provider: 'web', web: { firstName: 'Cara' } });
        expect(use3.status).toBe(400);

        const closed = await request(app).get(`/api/auth/invite/validate/${code}`);
        expect(closed.body.valid).toBe(false);
    });

    it('parallel invite use with initialRole user leaves only one new user', async () => {
        const admin = await seedUser({ role: 'admin' });
        await InviteCode.create({
            code: 'race-once',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() + 60_000),
            allowedProviders: ['telegram'],
            initialRole: 'user',
        });

        const initA = buildInitData(
            { id: 500001, first_name: 'RaceA', username: 'race_a' },
            BOT_TOKEN,
        );
        const initB = buildInitData(
            { id: 500002, first_name: 'RaceB', username: 'race_b' },
            BOT_TOKEN,
        );

        const [resA, resB] = await Promise.all([
            request(app)
                .post('/api/auth/invite/use')
                .send({
                    code: 'race-once',
                    provider: 'telegram',
                    telegram: { user: initA },
                }),
            request(app)
                .post('/api/auth/invite/use')
                .send({
                    code: 'race-once',
                    provider: 'telegram',
                    telegram: { user: initB },
                }),
        ]);

        const statuses = [resA.status, resB.status].sort();
        expect(statuses).toEqual([201, 400]);

        const created = await User.find({
            telegram_id: { $in: [500001, 500002] },
        });
        expect(created).toHaveLength(1);
        expect(created[0].role).toBe('user');
    });
});
