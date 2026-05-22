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

describe('role integration', () => {
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

    it('GET /api/users returns 403 for regular user', async () => {
        const user = await seedUser({ role: 'user' });

        const res = await request(app)
            .get('/api/users')
            .set(authHeader(user));

        expect(res.status).toBe(403);
    });

    it('GET /api/users returns 401 without token', async () => {
        const res = await request(app).get('/api/users');
        expect(res.status).toBe(401);
    });

    it('GET /api/users returns list for admin', async () => {
        const admin = await seedUser({ role: 'admin' });
        await seedUser({ role: 'guest', first_name: 'Listed' });

        const res = await request(app)
            .get('/api/users')
            .set(authHeader(admin));

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('admin cannot assign super_admin', async () => {
        const admin = await seedUser({ role: 'admin' });
        const guest = await seedUser({ role: 'guest', first_name: 'Target' });

        const res = await request(app)
            .put(`/api/users/${guest._id}/role`)
            .set(authHeader(admin))
            .send({ role: 'super_admin' });

        expect(res.status).toBe(403);
    });

    it('admin cannot change own role', async () => {
        const admin = await seedUser({ role: 'admin' });

        const res = await request(app)
            .put(`/api/users/${admin._id}/role`)
            .set(authHeader(admin))
            .send({ role: 'user' });

        expect(res.status).toBe(403);
    });

    it('super_admin can promote guest to admin', async () => {
        const superAdmin = await seedUser({ role: 'super_admin' });
        const guest = await seedUser({ role: 'guest', first_name: 'Promote' });

        const res = await request(app)
            .put(`/api/users/${guest._id}/role`)
            .set(authHeader(superAdmin))
            .send({ role: 'admin' });

        expect(res.status).toBe(200);
        expect(res.body.role).toBe('admin');
    });

    it('admin cannot delete super_admin', async () => {
        const admin = await seedUser({ role: 'admin' });
        const superAdmin = await seedUser({ role: 'super_admin', first_name: 'SA' });

        const res = await request(app)
            .delete(`/api/users/${superAdmin._id}`)
            .set(authHeader(admin));

        expect(res.status).toBe(403);
    });

    it('super_admin can delete guest', async () => {
        const superAdmin = await seedUser({ role: 'super_admin' });
        const guest = await seedUser({ role: 'guest', first_name: 'Del' });

        const res = await request(app)
            .delete(`/api/users/${guest._id}`)
            .set(authHeader(superAdmin));

        expect(res.status).toBe(200);
    });

    it('super_admin can cancel another user booking', async () => {
        const superAdmin = await seedUser({ role: 'super_admin' });
        const guest = await seedUser({ role: 'user', first_name: 'Booker' });
        const date = moment.utc().add(1, 'day').format('DD/MM/YYYY');
        const bookingDate = moment.utc(date, 'DD/MM/YYYY').startOf('day').toDate();

        await Rehearsal.create({
            date: bookingDate,
            hours: [{
                hour: '14:00',
                userId: String(guest._id),
                username: 'booker',
                band_name: 'Band',
                rehearsalType: 'rehearsal',
            }],
        });

        const res = await request(app)
            .delete('/api/cancel')
            .set(authHeader(superAdmin))
            .send({ date, hours: ['14:00'] });

        expect(res.status).toBe(200);
    });
});
