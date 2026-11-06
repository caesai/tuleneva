/**
 * @file В списке админки есть коллектив из последней брони.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import request from 'supertest';
import moment from 'moment';
import Rehearsal from '../../models/Rehearsal';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    createTestApp,
    seedUser,
    authHeader,
} from '../helpers/testApp';

describe('admin user band', () => {
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

    it('GET /api/users добавляет bandName из свежей брони', async () => {
        const admin = await seedUser({ role: 'admin' });
        const musician = await seedUser({ role: 'user', first_name: 'Аня', username: 'anya' });
        await Rehearsal.create({
            date: moment.utc('01/11/2026', 'DD/MM/YYYY').toDate(),
            hours: [{
                hour: '18:00',
                userId: String(musician._id),
                username: 'anya',
                band_name: 'Север',
                rehearsalType: 'rehearsal',
            }],
        });

        const res = await request(app)
            .get('/api/users')
            .set(authHeader(admin));

        const row = res.body.find((user) => user.username === 'anya');
        expect(row.bandName).toBe('Север');
        expect(res.body.find((user) => user.username === 'testuser').bandName).toBeNull();
    });
});
