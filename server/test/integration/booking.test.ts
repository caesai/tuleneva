import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from 'vitest';
import request from 'supertest';
import Rehearsal from '../../models/Rehearsal';
import { createBooking } from '../../booking/createBooking';
import { createBroadcast } from '../../realtime/createBroadcast';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    createTestApp,
    seedUser,
    authHeader,
} from '../helpers/testApp';

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
                hours: ['12:00'],
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
                hours: ['14:00', '14:00'],
                band_name: 'Band',
                rehearsalType: 'rehearsal',
            });
        expect(res.status).toBe(400);
    });

    it('rejects hours outside studio schedule', async () => {
        const user = await seedUser({ role: 'user' });
        const res = await request(app)
            .post('/api/book')
            .set(authHeader(user))
            .send({
                date: '16/06/2030',
                hours: ['09:00'],
                rehearsalType: 'rehearsal',
            });
        expect(res.status).toBe(400);
        expect(res.body.invalidHours).toEqual(['09:00']);
    });

    it('rejects past time slots', async () => {
        const user = await seedUser({ role: 'user' });
        const res = await request(app)
            .post('/api/book')
            .set(authHeader(user))
            .send({
                date: '01/01/2020',
                hours: ['14:00'],
                rehearsalType: 'rehearsal',
            });
        expect(res.status).toBe(400);
        expect(res.body.pastHours).toEqual(['14:00']);
    });

    it('defers notifyAdmins until afterResponse runs', async () => {
        const notifyAdmins = vi.fn(async () => {});
        const booking = createBooking({
            notifyAdmins,
            broadcastUpdate: () => {},
        });
        const user = await seedUser({ role: 'user', username: 'notify_user' });

        const result = await booking.book({
            dbUser: user,
            date: '19/06/2030',
            hours: ['13:00'],
            rehearsalType: 'rehearsal',
        });

        expect(result.status).toBe(201);
        expect(notifyAdmins).not.toHaveBeenCalled();
        expect(typeof result.afterResponse).toBe('function');
        if (!result.afterResponse) {
            throw new Error('afterResponse missing on successful book');
        }

        await result.afterResponse();
        expect(notifyAdmins).toHaveBeenCalledTimes(1);
    });

    it('returns 201 when notifyAdmins throws before a promise', async () => {
        const notifyAdmins = vi.fn(() => {
            throw new Error('notify boom');
        });
        const bookApp = createTestApp({ notifyAdmins });
        const user = await seedUser({ role: 'user', username: 'http_notify' });

        const res = await request(bookApp)
            .post('/api/book')
            .set(authHeader(user))
            .send({
                date: '19/06/2030',
                hours: ['14:00'],
                rehearsalType: 'rehearsal',
            });

        expect(res.status).toBe(201);
        expect(notifyAdmins).toHaveBeenCalledTimes(1);
        const docs = await Rehearsal.find({});
        expect(docs).toHaveLength(1);
    });

    it('publishes booking_update with public hours through createBroadcast', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const { publish, addClient } = createBroadcast();
        const client = { send: vi.fn(), readyState: 1 };
        addClient(client);

        const bookApp = createTestApp({ broadcastUpdate: publish });
        const user = await seedUser({
            role: 'user',
            username: 'ws_booker',
            first_name: 'Ws',
        });

        const res = await request(bookApp)
            .post('/api/book')
            .set(authHeader(user))
            .send({
                date: '18/06/2030',
                hours: ['15:00'],
                band_name: 'Secret Band',
                rehearsalType: 'rehearsal',
            });

        expect(res.status).toBe(201);
        expect(client.send).toHaveBeenCalledTimes(1);

        const message = JSON.parse(client.send.mock.calls[0][0]);
        expect(message.type).toBe('booking_update');
        expect(message.data.date).toBe('18/06/2030');
        expect(message.data.hours).toEqual([
            { hour: '15:00', rehearsalType: 'rehearsal' },
        ]);
        expect(message.data.hours[0].username).toBeUndefined();
        expect(message.data.hours[0].band_name).toBeUndefined();
        expect(typeof message.timestamp).toBe('number');

        logSpy.mockRestore();
    });

    it('rejects an overflowing cancel date', async () => {
        const user = await seedUser({ role: 'user' });
        const booking = createBooking();
        const result = await booking.cancel({
            dbUser: user,
            date: '32/01/2030',
            hours: ['14:00'],
        });
        expect(result.status).toBe(400);
    });

    it('lists only the hours the caller actually canceled', async () => {
        const owner = await seedUser({ role: 'user', username: 'owner_part' });
        const other = await seedUser({ role: 'user', username: 'other_part' });
        const booking = createBooking();
        const date = '22/06/2030';

        expect((await booking.book({
            dbUser: owner,
            date,
            hours: ['14:00', '15:00'],
            rehearsalType: 'rehearsal',
        })).status).toBe(201);
        expect((await booking.book({
            dbUser: other,
            date,
            hours: ['16:00'],
            rehearsalType: 'rehearsal',
        })).status).toBe(201);

        const canceled = await booking.cancel({
            dbUser: owner,
            date,
            hours: ['14:00', '16:00'],
        });
        expect(canceled.status).toBe(200);
        expect(canceled.body.canceledHours).toEqual(['14:00']);

        const doc = await Rehearsal.findOne({});
        expect(doc?.hours.map((slot) => slot.hour).sort()).toEqual(['15:00', '16:00']);
    });

    it('does not remove a slot that was rebooked after the admin read it', async () => {
        const owner = await seedUser({ role: 'user', username: 'owner_race' });
        const next = await seedUser({ role: 'user', username: 'next_race' });
        const admin = await seedUser({ role: 'admin', username: 'admin_race' });
        const booking = createBooking({
            notifyUser: async () => {},
            notifyAdmins: async () => {},
        });
        const date = '23/06/2030';

        expect((await booking.book({
            dbUser: owner,
            date,
            hours: ['16:00'],
            rehearsalType: 'rehearsal',
        })).status).toBe(201);

        const originalFindOne = Rehearsal.findOne.bind(Rehearsal);
        const spy = vi.spyOn(Rehearsal, 'findOne').mockImplementationOnce(((filter: object) => {
            const query = originalFindOne(filter);
            return query.then(async (doc) => {
                if (doc) {
                    await Rehearsal.updateOne(
                        { _id: doc._id, 'hours.hour': '16:00' },
                        { $set: { 'hours.$.userId': String(next._id), 'hours.$.username': 'next' } },
                    );
                }
                return doc;
            });
        }) as typeof Rehearsal.findOne);

        const canceled = await booking.cancel({
            dbUser: admin,
            date,
            hours: ['16:00'],
        });
        spy.mockRestore();

        expect(canceled.status).toBe(409);
        const doc = await Rehearsal.findOne({});
        expect(doc?.hours).toHaveLength(1);
        expect(String(doc?.hours[0]?.userId)).toBe(String(next._id));
    });

    it('keeps legacy booked hours when a new slot is added', async () => {
        const user = await seedUser({ role: 'user', username: 'after_legacy' });
        const date = new Date(Date.UTC(2030, 5, 21));
        await Rehearsal.collection.insertOne({
            date,
            hours: {
                '14:00': {
                    status: 'BOOKED',
                    userId: 'legacy-user',
                    owner: 'legacy',
                    bandName: 'Old',
                },
                '15:00': { status: 'FREE' },
            },
        });

        const booking = createBooking();
        const result = await booking.book({
            dbUser: user,
            date: '21/06/2030',
            hours: ['16:00'],
            rehearsalType: 'rehearsal',
        });
        expect(result.status).toBe(201);

        const doc = await Rehearsal.findOne({});
        expect(doc?.hours.map((slot) => slot.hour).sort()).toEqual(['14:00', '16:00']);
        expect(doc?.hours.find((slot) => slot.hour === '14:00')?.username).toBe('legacy');
    });

    it('keeps a slot booked while legacy hours are converted', async () => {
        const user = await seedUser({ role: 'user', username: 'legacy_race' });
        const date = new Date(Date.UTC(2030, 5, 24));
        await Rehearsal.collection.insertOne({
            date,
            hours: {
                '14:00': {
                    status: 'BOOKED',
                    userId: 'legacy-user',
                    owner: 'legacy',
                    bandName: 'Old',
                },
            },
        });

        const findOne = Rehearsal.collection.findOne.bind(Rehearsal.collection);
        const spy = vi.spyOn(Rehearsal.collection, 'findOne').mockImplementationOnce(async (...args) => {
            const raw = await findOne(...args);
            if (raw?._id) {
                await Rehearsal.collection.updateOne(
                    { _id: raw._id },
                    {
                        $set: {
                            hours: [
                                {
                                    hour: '14:00',
                                    userId: 'legacy-user',
                                    username: 'legacy',
                                    band_name: 'Old',
                                    rehearsalType: 'rehearsal',
                                },
                                {
                                    hour: '18:00',
                                    userId: 'racer',
                                    username: 'racer',
                                    band_name: '',
                                    rehearsalType: 'rehearsal',
                                },
                            ],
                        },
                    },
                );
            }
            return raw;
        });

        const booking = createBooking();
        try {
            const result = await booking.book({
                dbUser: user,
                date: '24/06/2030',
                hours: ['16:00'],
                rehearsalType: 'rehearsal',
            });
            expect(result.status).toBe(201);
        } finally {
            spy.mockRestore();
        }

        const doc = await Rehearsal.findOne({});
        expect(doc?.hours.map((slot) => slot.hour).sort()).toEqual(['14:00', '16:00', '18:00']);
    });

    it('highlights the UTC day of a booking', async () => {
        const user = await seedUser({ role: 'user', username: 'utc_day' });
        const booking = createBooking();
        expect((await booking.book({
            dbUser: user,
            date: '01/06/2030',
            hours: ['12:00'],
            rehearsalType: 'rehearsal',
        })).status).toBe(201);

        await Rehearsal.create({
            date: new Date(Date.UTC(2030, 5, 2)),
            hours: [],
        });

        const month = await booking.getMonthDates({ date: '15/06/2030' });
        expect(month.status).toBe(200);
        expect(month.body.result).toContain('01/06/2030');
        expect(month.body.result).not.toContain('31/05/2030');
        expect(month.body.result).not.toContain('02/06/2030');
    });
});
