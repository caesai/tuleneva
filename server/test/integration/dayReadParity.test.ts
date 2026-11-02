import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from 'vitest';
import moment from 'moment';
import request from 'supertest';
import Rehearsal from '../../models/Rehearsal';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    createTestApp,
    seedUser,
    authHeader,
} from '../helpers/testApp';
import { loadHoursForDate, loadMyRehearsals } from '../../telegram/createBot';
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

    it('loadMyRehearsals keeps the user day after other studio days', async () => {
        const mine = await seedUser({
            role: 'user',
            username: 'late_mine',
            first_name: 'Late',
        });
        const other = await seedUser({
            role: 'user',
            username: 'early_other',
            first_name: 'Early',
        });
        const slot = (userId, username) => ({
            hour: '12:00',
            userId: String(userId),
            username,
            band_name: username === 'late_mine' ? 'Late Band' : 'Early Band',
            rehearsalType: 'rehearsal',
        });
        const at = (date) => moment.utc(date, 'DD/MM/YYYY').startOf('day').toDate();
        await Rehearsal.create({ date: at('01/07/2030'), hours: [slot(other._id, 'early_other')] });
        await Rehearsal.create({ date: at('02/07/2030'), hours: [slot(other._id, 'early_other')] });
        await Rehearsal.create({ date: at('03/07/2030'), hours: [slot(mine._id, 'late_mine')] });

        const days = await loadMyRehearsals(mine._id, at('01/07/2030'), 1);
        expect(days).toHaveLength(1);
        expect(days[0].date).toBe('03/07/2030');
        const text = formatMyBookings(days, String(mine._id));
        expect(text).toContain('Late Band');
        expect(text).not.toContain('Early Band');
    });
});
