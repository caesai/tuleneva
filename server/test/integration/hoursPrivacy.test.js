import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import request from 'supertest';
import moment from 'moment';
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
 * GET /api/hours: PII только для участника (role !== guest).
 */
describe('GET /api/hours privacy', () => {
    let app;
    const date = '20/06/2030';

    beforeAll(async () => {
        await connectTestDb();
        app = createTestApp();
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
        const bookingDate = moment.utc(date, 'DD/MM/YYYY').startOf('day').toDate();
        await Rehearsal.create({
            date: bookingDate,
            hours: [
                {
                    hour: '14:00',
                    userId: 'u1',
                    username: 'secret_owner',
                    band_name: 'Secret Band',
                    userPhotoUrl: 'https://example.com/a.jpg',
                    rehearsalType: 'rehearsal',
                },
            ],
        });
    });

    it('strips username and band_name without auth', async () => {
        const res = await request(app).get('/api/hours').query({ date });

        expect(res.status).toBe(200);
        expect(res.body.hours).toEqual([
            { hour: '14:00', rehearsalType: 'rehearsal' },
        ]);
        expect(res.body.hours[0].username).toBeUndefined();
        expect(res.body.hours[0].band_name).toBeUndefined();
    });

    it('returns PII for authenticated user role', async () => {
        const user = await seedUser({ role: 'user', username: 'viewer' });
        const res = await request(app)
            .get('/api/hours')
            .query({ date })
            .set(authHeader(user));

        expect(res.status).toBe(200);
        expect(res.body.hours).toHaveLength(1);
        expect(res.body.hours[0].username).toBe('secret_owner');
        expect(res.body.hours[0].band_name).toBe('Secret Band');
        expect(res.body.hours[0].hour).toBe('14:00');
    });

    it('strips PII for authenticated guest', async () => {
        const guest = await seedUser({ role: 'guest', username: 'guesty' });
        const res = await request(app)
            .get('/api/hours')
            .query({ date })
            .set(authHeader(guest));

        expect(res.status).toBe(200);
        expect(res.body.hours).toEqual([
            { hour: '14:00', rehearsalType: 'rehearsal' },
        ]);
    });
});
