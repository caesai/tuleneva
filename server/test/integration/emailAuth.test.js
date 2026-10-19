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
import { resetLoginAttemptsForTests } from '../../auth/emailProvider.js';
import { AuthSessionResponseSchema } from '../../../shared/contracts/auth.ts';

describe('email auth integration', () => {
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
        resetLoginAttemptsForTests();
    });

    it('link then login keeps the same _id', async () => {
        const user = await seedUser({
            role: 'user',
            telegram_id: 111001,
            identities: [{ provider: 'telegram', providerUserId: '111001' }],
        });

        const link = await request(app)
            .post('/api/auth/providers/email/link')
            .set(authHeader(user))
            .send({ email: 'same@example.com', password: 'password12' });

        expect(link.status).toBe(200);
        expect(() => AuthSessionResponseSchema.parse(link.body)).not.toThrow();
        expect(link.body.user._id).toBe(String(user._id));
        expect(link.body.user.emailLogin).toBe('same@example.com');
        expect(link.body.user.passwordHash).toBeUndefined();

        const login = await request(app)
            .post('/api/auth/providers/email/login')
            .send({ email: 'same@example.com', password: 'password12' });

        expect(login.status).toBe(200);
        expect(login.body.user._id).toBe(String(user._id));
        expect(login.body.token).toBeTruthy();
        expect(login.body.authProvider).toBe('email');
    });

    it('link returns 409 when email belongs to another user', async () => {
        await seedUser({
            role: 'user',
            emailLogin: 'taken@example.com',
            first_name: 'Other',
        });
        const user = await seedUser({ role: 'user', first_name: 'Me' });

        const res = await request(app)
            .post('/api/auth/providers/email/link')
            .set(authHeader(user))
            .send({ email: 'taken@example.com', password: 'password12' });

        expect(res.status).toBe(409);
    });

    it('admin can set email-login; plain admin cannot set for another admin', async () => {
        const admin = await seedUser({ role: 'admin', first_name: 'Admin' });
        const target = await seedUser({ role: 'user', first_name: 'Target' });
        const otherAdmin = await seedUser({ role: 'admin', first_name: 'Peer' });

        const ok = await request(app)
            .put(`/api/users/${target._id}/email-login`)
            .set(authHeader(admin))
            .send({ email: 'target@example.com', password: 'password12' });
        expect(ok.status).toBe(200);
        expect(ok.body.emailLogin).toBe('target@example.com');
        expect(ok.body.passwordHash).toBeUndefined();

        const denied = await request(app)
            .put(`/api/users/${otherAdmin._id}/email-login`)
            .set(authHeader(admin))
            .send({ email: 'peer@example.com', password: 'password12' });
        expect(denied.status).toBe(403);
    });

    it('guest with email login gets null token and cannot book', async () => {
        const guest = await seedUser({ role: 'guest', first_name: 'Guest' });
        await request(app)
            .post('/api/auth/providers/email/link')
            .set(authHeader(guest))
            .send({ email: 'guest@example.com', password: 'password12' });

        const login = await request(app)
            .post('/api/auth/providers/email/login')
            .send({ email: 'guest@example.com', password: 'password12' });
        expect(login.status).toBe(200);
        expect(login.body.token).toBeNull();

        const user = await seedUser({ role: 'user', first_name: 'Booker' });
        await request(app)
            .post('/api/auth/providers/email/link')
            .set(authHeader(user))
            .send({ email: 'booker@example.com', password: 'password12' });

        // guest JWT was signed at link time before role check on login;
        // book with guest session from link response
        const guestLink = await request(app)
            .post('/api/auth/providers/email/link')
            .set(authHeader(guest))
            .send({ email: 'guest2@example.com', password: 'password12' });

        const book = await request(app)
            .post('/api/book')
            .set({ Authorization: `Bearer ${guestLink.body.token}` })
            .send({
                date: '01/01/2030',
                hours: ['12:00'],
                band_name: 'Band',
                rehearsalType: 'rehearsal',
            });
        expect(book.status).toBe(403);
    });

    it('legacy invite reuse fails after consumeInvite', async () => {
        const admin = await seedUser({ role: 'admin' });
        const initData = buildInitData(
            { id: 900001, first_name: 'Legacy', username: 'leg' },
            BOT_TOKEN,
        );

        await InviteCode.create({
            code: 'legacy-once',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() + 60_000),
            allowedProviders: ['telegram'],
        });

        const first = await request(app)
            .post('/api/invite/use')
            .send({ code: 'legacy-once', user: initData });
        expect(first.status).toBe(201);

        const second = await request(app)
            .post('/api/invite/use')
            .send({ code: 'legacy-once', user: initData });
        expect(second.status).toBe(400);

        const users = await User.find({ telegram_id: 900001 });
        expect(users).toHaveLength(1);
    });

    it('migrate telegram identities requires admin', async () => {
        const user = await seedUser({ role: 'user' });
        const denied = await request(app)
            .post('/api/auth/migrate/telegram-identities')
            .set(authHeader(user));
        expect(denied.status).toBe(403);

        const admin = await seedUser({ role: 'admin', first_name: 'MigAdmin' });
        const ok = await request(app)
            .post('/api/auth/migrate/telegram-identities')
            .set(authHeader(admin));
        expect(ok.status).toBe(200);
        expect(ok.body).toHaveProperty('migrated');
    });
});
