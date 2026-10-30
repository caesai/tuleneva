import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from 'vitest';
import request from 'supertest';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    createTestApp,
    seedUser,
    authHeader,
} from '../helpers/testApp.js';
import { loadHoursForDate } from '../../telegram/createBot.js';
import { formatDayBookings } from '../../telegram/scheduleMessages.js';

/**
 * HTTP /api/hours режет PII. Ответ бота в чат — только интервалы, без имени.
 */
describe('day-read parity HTTP vs bot', () => {
    let app;

    beforeAll(async () => {
        await connectTestDb();
        app = createTestApp();
        vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterAll(async () => {
        vi.restoreAllMocks();
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
    });

    it('anonymous GET /api/hours and bot day text omit the booker', async () => {
        const user = await seedUser({
            role: 'user',
            username: 'parity_user',
            first_name: 'Parity',
        });
        const date = '21/06/2030';

        const book = await request(app)
            .post('/api/book')
            .set(authHeader(user))
            .send({
                date,
                hours: ['16:00'],
                band_name: 'Parity Band',
                rehearsalType: 'rehearsal',
            });
        expect(book.status).toBe(201);

        const publicRes = await request(app).get('/api/hours').query({ date });
        expect(publicRes.status).toBe(200);
        expect(publicRes.body.hours).toEqual([
            { hour: '16:00', rehearsalType: 'rehearsal' },
        ]);
        expect(publicRes.body.hours[0].username).toBeUndefined();

        const botHours = await loadHoursForDate(date);
        expect(botHours).toHaveLength(1);
        expect(botHours[0].hour).toBe('16:00');

        const botText = formatDayBookings(date, botHours, 'Сегодня');
        expect(botText).toContain('16:00 - 17:00 — занято');
        expect(botText).not.toContain('parity_user');
        expect(botText).not.toContain('Parity');
        expect(botText).not.toContain('Parity Band');
    });
});
