import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from 'vitest';
import request from 'supertest';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    createTestApp,
    seedUser,
    authHeader,
} from '../helpers/testApp';
import { loadHoursForDate } from '../../telegram/createBot';
import { formatDayBookings, formatMyBookings } from '../../telegram/scheduleMessages';

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

    it('formatMyBookings keeps own day-read slots and drops others', async () => {
        const mine = await seedUser({
            role: 'user',
            username: 'my_slots',
            first_name: 'Mine',
        });
        const other = await seedUser({
            role: 'user',
            username: 'other_slots',
            first_name: 'Other',
        });
        const date = '22/06/2030';

        const bookMine = await request(app)
            .post('/api/book')
            .set(authHeader(mine))
            .send({
                date,
                hours: ['14:00'],
                band_name: 'My Band',
                rehearsalType: 'rehearsal',
            });
        expect(bookMine.status).toBe(201);

        const bookOther = await request(app)
            .post('/api/book')
            .set(authHeader(other))
            .send({
                date,
                hours: ['15:00'],
                band_name: 'Other Band',
                rehearsalType: 'rehearsal',
            });
        expect(bookOther.status).toBe(201);

        const hours = await loadHoursForDate(date);
        const text = formatMyBookings([{ date, hours }], String(mine._id));
        expect(text).toContain('14:00');
        expect(text).toContain('My Band');
        expect(text).not.toContain('15:00');
        expect(text).not.toContain('Other Band');
    });
});
