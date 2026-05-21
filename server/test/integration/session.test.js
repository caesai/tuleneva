import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import request from 'supertest';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    createTestApp,
    seedUser,
    authHeader,
} from '../helpers/testApp.js';

describe('session integration', () => {
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

    it('guest JWT returns session 200', async () => {
        const guest = await seedUser({ role: 'guest' });
        const res = await request(app)
            .get('/api/auth/session')
            .set(authHeader(guest));

        expect(res.status).toBe(200);
        expect(res.body.valid).toBe(true);
    });

    it('missing token returns 401', async () => {
        const res = await request(app).get('/api/auth/session');
        expect(res.status).toBe(401);
    });
});
