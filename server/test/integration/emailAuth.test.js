import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from 'vitest';
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
import {
    AuthSessionResponseSchema,
    EmailLinkResponseSchema,
} from '../../../shared/contracts/auth.ts';

describe('email auth integration', () => {
    let app;
    let sentMails;
    let sendMail;

    beforeAll(async () => {
        await connectTestDb();
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
        resetLoginAttemptsForTests();
        sentMails = [];
        sendMail = vi.fn(async (opts) => {
            sentMails.push(opts);
        });
        app = createTestApp({ sendMail });
    });

    /**
     * Достаёт сырой токен из последнего письма.
     * @returns {string}
     */
    const lastConfirmToken = () => {
        const last = sentMails[sentMails.length - 1];
        const match = String(last?.text || '').match(/emailConfirm=([a-f0-9]+)/i);
        if (!match) {
            throw new Error('Confirm token not found in mail');
        }
        return match[1];
    };

    it('link without SMTP returns 503', async () => {
        const noMailApp = createTestApp({ sendMail: null });
        const user = await seedUser({
            role: 'user',
            telegram_id: 111000,
            identities: [{ provider: 'telegram', providerUserId: '111000' }],
        });

        const link = await request(noMailApp)
            .post('/api/auth/providers/email/link')
            .set(authHeader(user))
            .send({ email: 'nosmtp@example.com', password: 'password12' });

        expect(link.status).toBe(503);
        expect(link.body.valid).toBe(false);
    });

    it('link then confirm then login keeps the same _id', async () => {
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
        expect(() => EmailLinkResponseSchema.parse(link.body)).not.toThrow();
        expect(link.body.pendingConfirmation).toBe(true);
        expect(link.body.user.emailLogin).toBeFalsy();
        expect(sendMail).toHaveBeenCalledOnce();

        const beforeConfirm = await request(app)
            .post('/api/auth/providers/email/login')
            .send({ email: 'same@example.com', password: 'password12' });
        expect(beforeConfirm.status).toBe(401);

        const confirm = await request(app)
            .post('/api/auth/providers/email/confirm')
            .send({ token: lastConfirmToken() });

        expect(confirm.status).toBe(200);
        expect(() => AuthSessionResponseSchema.parse(confirm.body)).not.toThrow();
        expect(confirm.body.user._id).toBe(String(user._id));
        expect(confirm.body.user.emailLogin).toBe('same@example.com');
        expect(confirm.body.user.passwordHash).toBeUndefined();
        expect(confirm.body.token).toBeTruthy();

        const login = await request(app)
            .post('/api/auth/providers/email/login')
            .send({ email: 'same@example.com', password: 'password12' });

        expect(login.status).toBe(200);
        expect(login.body.user._id).toBe(String(user._id));
        expect(login.body.token).toBeTruthy();
        expect(login.body.authProvider).toBe('email');
    });

    it('password change on same email requires currentPassword', async () => {
        const user = await seedUser({
            role: 'user',
            telegram_id: 111010,
            identities: [{ provider: 'telegram', providerUserId: '111010' }],
        });

        await request(app)
            .post('/api/auth/providers/email/link')
            .set(authHeader(user))
            .send({ email: 'chg@example.com', password: 'password12' });
        await request(app)
            .post('/api/auth/providers/email/confirm')
            .send({ token: lastConfirmToken() });

        const missing = await request(app)
            .post('/api/auth/providers/email/link')
            .set(authHeader(user))
            .send({ email: 'chg@example.com', password: 'password99' });
        expect(missing.status).toBe(400);

        const ok = await request(app)
            .post('/api/auth/providers/email/link')
            .set(authHeader(user))
            .send({
                email: 'chg@example.com',
                password: 'password99',
                currentPassword: 'password12',
            });
        expect(ok.status).toBe(200);
        expect(ok.body.pendingConfirmation).toBe(false);

        const login = await request(app)
            .post('/api/auth/providers/email/login')
            .send({ email: 'chg@example.com', password: 'password99' });
        expect(login.status).toBe(200);
    });

    it('invalid confirm token returns 400', async () => {
        const res = await request(app)
            .post('/api/auth/providers/email/confirm')
            .send({ token: 'deadbeef'.repeat(8) });
        expect(res.status).toBe(400);
    });

    it('link returns 409 when email belongs to another user', async () => {
        const first = await seedUser({
            role: 'user',
            telegram_id: 111020,
            identities: [{ provider: 'telegram', providerUserId: '111020' }],
        });
        await request(app)
            .post('/api/auth/providers/email/link')
            .set(authHeader(first))
            .send({ email: 'taken@example.com', password: 'password12' });
        await request(app)
            .post('/api/auth/providers/email/confirm')
            .send({ token: lastConfirmToken() });

        const user = await seedUser({ role: 'user', first_name: 'Me' });

        const res = await request(app)
            .post('/api/auth/providers/email/link')
            .set(authHeader(user))
            .send({ email: 'taken@example.com', password: 'password12' });

        expect(res.status).toBe(409);
        expect(res.body.message).toBe('Email already in use');
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
        expect(ok.body.pendingConfirmation).toBe(true);
        expect(ok.body.emailLogin).toBeFalsy();
        expect(ok.body.passwordHash).toBeUndefined();
        expect(sendMail).toHaveBeenCalled();

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
        const guestConfirm = await request(app)
            .post('/api/auth/providers/email/confirm')
            .send({ token: lastConfirmToken() });
        expect(guestConfirm.status).toBe(200);
        expect(guestConfirm.body.token).toBeNull();

        const login = await request(app)
            .post('/api/auth/providers/email/login')
            .send({ email: 'guest@example.com', password: 'password12' });
        expect(login.status).toBe(200);
        expect(login.body.token).toBeNull();

        const book = await request(app)
            .post('/api/book')
            .set(authHeader(guest))
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
