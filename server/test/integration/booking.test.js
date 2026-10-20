import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import request from 'supertest';
import Rehearsal from '../../models/Rehearsal.js';
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
                hours: ['11:00'],
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
                hours: ['10:00', '10:00'],
                band_name: 'Band',
                rehearsalType: 'rehearsal',
            });
        expect(res.status).toBe(400);
    });
});
