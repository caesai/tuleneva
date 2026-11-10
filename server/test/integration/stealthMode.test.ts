/**
 * @file Стелс: календарь и создание пользователей только для уже существующего списка.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import User from '../../models/User';
import { buildInitData } from '../fixtures/buildInitData';
import {
    BOT_TOKEN,
    authHeader,
    clearTestDb,
    connectTestDb,
    createTestApp,
    disconnectTestDb,
    seedUser,
} from '../helpers/testApp';

const outsider = { id: 900001, first_name: 'Out', username: 'outsider' };
const listedTelegramId = 900002;

describe('stealth mode calendar', () => {
    let app;

    beforeAll(async () => {
        await connectTestDb();
        app = createTestApp({ stealthMode: true });
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
    });

    it('rejects anonymous calendar and booking calls', async () => {
        const timetable = await request(app).get('/api/timetable').query({ date: '01/06/2030' });
        const hours = await request(app).get('/api/hours').query({ date: '01/06/2030' });
        const book = await request(app).post('/api/book').send({
            date: '01/06/2030',
            hours: ['12:00'],
            rehearsalType: 'rehearsal',
        });
        const cancel = await request(app).delete('/api/cancel').send({
            date: '01/06/2030',
            hours: ['12:00'],
        });

        expect(timetable.status).toBe(401);
        expect(hours.status).toBe(401);
        expect(book.status).toBe(401);
        expect(cancel.status).toBe(401);
        expect(JSON.stringify(timetable.body)).not.toMatch(/12:00|hours/);
        expect(JSON.stringify(hours.body)).not.toMatch(/12:00/);
    });

    it('rejects a Telegram user who is not in the list and does not create one', async () => {
        const initData = buildInitData(outsider, BOT_TOKEN);
        const before = await User.countDocuments();

        const login = await request(app)
            .post('/api/auth/providers/telegram/login')
            .send({ user: initData });
        const register = await request(app)
            .post('/api/auth/providers/telegram/register')
            .send({ user: initData });
        const legacy = await request(app)
            .post('/api/users/register')
            .send({ user: initData });
        const timetable = await request(app)
            .get('/api/timetable')
            .query({ date: '01/06/2030' })
            .set('X-Telegram-Init-Data', initData);

        expect(login.status).toBe(200);
        expect(login.body.token).toBeNull();
        expect(login.body.user._id).toBeUndefined();
        expect(register.status).toBe(403);
        expect(legacy.status).toBe(403);
        expect(timetable.status).toBe(403);
        expect(await User.countDocuments()).toBe(before);
    });

    it('creates a user from an admin invite and lets that user open the calendar', async () => {
        const admin = await seedUser({ role: 'admin' });
        const initData = buildInitData(outsider, BOT_TOKEN);
        const before = await User.countDocuments();
        const gen = await request(app)
            .post('/api/auth/invite/generate')
            .set(authHeader(admin))
            .send({ allowedProviders: ['telegram'], initialRole: 'user' });

        const used = await request(app)
            .post('/api/auth/invite/use')
            .send({
                code: gen.body.code,
                provider: 'telegram',
                telegram: { user: initData },
            });
        const created = await User.findOne({ telegram_id: outsider.id });
        const timetable = await request(app)
            .get('/api/timetable')
            .query({ date: '01/06/2030' })
            .set('Authorization', `Bearer ${used.body.token}`);

        expect(gen.status).toBe(201);
        expect(used.status).toBe(201);
        expect(created).toBeTruthy();
        expect(created?.role).toBe('user');
        expect(await User.countDocuments()).toBe(before + 1);
        expect(timetable.status).toBe(200);
        expect(timetable.body.result).toEqual([]);
    });

    it('lets a listed user read the calendar and book', async () => {
        const user = await seedUser({
            role: 'user',
            username: 'listed',
            telegram_id: listedTelegramId,
        });
        const initData = buildInitData(
            { id: listedTelegramId, first_name: 'Listed', username: 'listed' },
            BOT_TOKEN,
        );

        const byToken = await request(app)
            .get('/api/timetable')
            .query({ date: '01/06/2030' })
            .set(authHeader(user));
        const byInit = await request(app)
            .get('/api/hours')
            .query({ date: '17/06/2030' })
            .set('X-Telegram-Init-Data', initData);
        const book = await request(app)
            .post('/api/book')
            .set(authHeader(user))
            .send({
                date: '17/06/2030',
                hours: ['12:00'],
                rehearsalType: 'rehearsal',
            });
        const config = await request(app).get('/api/config');

        expect(byToken.status).toBe(200);
        expect(byToken.body.result).toEqual([]);
        expect(byInit.status).toBe(200);
        expect(book.status).toBe(201);
        expect(config.body.stealthMode).toBe(true);
    });

    it('keeps the admin user list available', async () => {
        const admin = await seedUser({ role: 'admin', first_name: 'Ada' });
        const res = await request(app).get('/api/users').set(authHeader(admin));

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });
});
