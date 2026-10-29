import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from 'vitest';
import request from 'supertest';
import Rehearsal from '../../models/Rehearsal.js';
import { createBroadcast } from '../../realtime/createBroadcast.js';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    createTestApp,
    seedUser,
    authHeader,
} from '../helpers/testApp.js';

/**
 * Интеграционные тесты бронирования: атомарность одного часа.
 */
describe('booking integration', () => {
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

    it('parallel book of the same hour yields 201 and 409 with a single slot', async () => {
        const userA = await seedUser({ role: 'user', first_name: 'BookerA', username: 'booker_a' });
        const userB = await seedUser({ role: 'user', first_name: 'BookerB', username: 'booker_b' });

        const payload = {
            date: '15/06/2030',
            hours: ['14:00'],
            band_name: 'Band',
            rehearsalType: 'rehearsal',
        };

        const [resA, resB] = await Promise.all([
            request(app).post('/api/book').set(authHeader(userA)).send(payload),
            request(app).post('/api/book').set(authHeader(userB)).send(payload),
        ]);

        const statuses = [resA.status, resB.status].sort();
        expect(statuses).toEqual([201, 409]);

        const winner = resA.status === 201 ? resA : resB;
        const loser = resA.status === 409 ? resA : resB;
        expect(loser.body.conflictingHours).toEqual(['14:00']);

        const docs = await Rehearsal.find({});
        expect(docs).toHaveLength(1);
        const slotsAt1400 = docs[0].hours.filter((h) => h.hour === '14:00');
        expect(slotsAt1400).toHaveLength(1);
        expect(String(slotsAt1400[0].userId)).toBe(String(winner.body.hours.find((h) => h.hour === '14:00').userId));
    });

    it('books without a band name', async () => {
        const user = await seedUser({ role: 'user', username: 'solo' });
        const res = await request(app)
            .post('/api/book')
            .set(authHeader(user))
            .send({
                date: '17/06/2030',
                hours: ['12:00'],
                rehearsalType: 'rehearsal',
            });
        expect(res.status).toBe(201);
        const docs = await Rehearsal.find({});
        expect(docs[0].hours[0].band_name).toBe('');
    });

    it('rejects duplicate hours in a single request', async () => {
        const user = await seedUser({ role: 'user' });
        const res = await request(app)
            .post('/api/book')
            .set(authHeader(user))
            .send({
                date: '16/06/2030',
                hours: ['14:00', '14:00'],
                band_name: 'Band',
                rehearsalType: 'rehearsal',
            });
        expect(res.status).toBe(400);
    });

    it('rejects hours outside studio schedule', async () => {
        const user = await seedUser({ role: 'user' });
        const res = await request(app)
            .post('/api/book')
            .set(authHeader(user))
            .send({
                date: '16/06/2030',
                hours: ['09:00'],
                rehearsalType: 'rehearsal',
            });
        expect(res.status).toBe(400);
        expect(res.body.invalidHours).toEqual(['09:00']);
    });

    it('rejects past time slots', async () => {
        const user = await seedUser({ role: 'user' });
        const res = await request(app)
            .post('/api/book')
            .set(authHeader(user))
            .send({
                date: '01/01/2020',
                hours: ['14:00'],
                rehearsalType: 'rehearsal',
            });
        expect(res.status).toBe(400);
        expect(res.body.pastHours).toEqual(['14:00']);
    });

    it('publishes booking_update with public hours through createBroadcast', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { publish, addClient } = createBroadcast();
        const client = { send: vi.fn(), readyState: 1 };
        addClient(client);

        const bookApp = createTestApp({ broadcastUpdate: publish });
        const user = await seedUser({
            role: 'user',
            username: 'ws_booker',
            first_name: 'Ws',
        });

        const res = await request(bookApp)
            .post('/api/book')
            .set(authHeader(user))
            .send({
                date: '18/06/2030',
                hours: ['15:00'],
                band_name: 'Secret Band',
                rehearsalType: 'rehearsal',
            });

        expect(res.status).toBe(201);
        expect(client.send).toHaveBeenCalledTimes(1);

        const message = JSON.parse(client.send.mock.calls[0][0]);
        expect(message.type).toBe('booking_update');
        expect(message.data.date).toBe('18/06/2030');
        expect(message.data.hours).toEqual([
            { hour: '15:00', rehearsalType: 'rehearsal' },
        ]);
        expect(message.data.hours[0].username).toBeUndefined();
        expect(message.data.hours[0].band_name).toBeUndefined();
        expect(typeof message.timestamp).toBe('number');

        logSpy.mockRestore();
    });
});
