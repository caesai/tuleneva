import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from 'vitest';
import request from 'supertest';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    createTestApp,
} from '../helpers/testApp.js';

describe('POST /api/telegram/webhook', () => {
    beforeAll(async () => {
        await connectTestDb();
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
    });

    it('returns 404 when webhook is not configured', async () => {
        const app = createTestApp();
        const res = await request(app).post('/api/telegram/webhook').send({});
        expect(res.status).toBe(404);
    });

    it('returns 401 without secret header', async () => {
        const handleUpdate = vi.fn().mockResolvedValue(undefined);
        const app = createTestApp({
            telegramBot: { handleUpdate },
            telegramWebhookSecret: 'secret-token',
        });
        const res = await request(app).post('/api/telegram/webhook').send({ update_id: 1 });
        expect(res.status).toBe(401);
        expect(handleUpdate).not.toHaveBeenCalled();
    });

    it('forwards update when secret matches', async () => {
        const handleUpdate = vi.fn().mockResolvedValue(undefined);
        const app = createTestApp({
            telegramBot: { handleUpdate },
            telegramWebhookSecret: 'secret-token',
        });
        const body = { update_id: 42 };
        const res = await request(app)
            .post('/api/telegram/webhook')
            .set('X-Telegram-Bot-Api-Secret-Token', 'secret-token')
            .send(body);
        expect(res.status).toBe(200);
        expect(handleUpdate).toHaveBeenCalledWith(body);
    });
});
