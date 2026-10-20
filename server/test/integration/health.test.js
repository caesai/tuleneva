import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import {
    connectTestDb,
    disconnectTestDb,
    createTestApp,
} from '../helpers/testApp.js';

describe('GET /api/health', () => {
    let app;

    beforeAll(async () => {
        await connectTestDb();
        app = createTestApp();
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    it('returns 200 when Mongo is connected', async () => {
        expect(mongoose.connection.readyState).toBe(1);
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, mongo: 'connected' });
    });
});
