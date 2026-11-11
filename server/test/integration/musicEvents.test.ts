/**
 * @file Публичные события /music: проверка тела, дедупликация, стелс и сводка только супер-админу.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import request from 'supertest';
import { MusicEventResponseSchema, MusicStatsResponseSchema } from '../../../shared/contracts/music';
import { MUSIC_EVENT_DEDUPE_MS } from '../../../shared/musicListen';
import MusicCollection from '../../models/MusicCollection';
import MusicEvent from '../../models/MusicEvent';
import MusicTrack from '../../models/MusicTrack';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    createTestApp,
    seedUser,
    authHeader,
} from '../helpers/testApp';

const session = '11111111-1111-4111-8111-111111111111';
const otherSession = '22222222-2222-4222-8222-222222222222';

describe('music events', () => {
    let app;

    beforeAll(async () => {
        await connectTestDb();
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
        app = createTestApp();
    });

    const publishTrack = async (user, title = 'Ночь') => {
        const track = await MusicTrack.create({
            title,
            credits: 'Север',
            status: 'published',
            audioKey: `audio/${title}`,
            audioBytes: 8,
            publishedAt: new Date(),
            createdBy: user._id,
            updatedBy: user._id,
        });
        return String(track._id);
    };

    const publishCollection = async (user, type: 'album' | 'playlist', title: string) => {
        const collection = await MusicCollection.create({
            type,
            title,
            status: 'published',
            trackIds: [],
            publishedAt: new Date(),
            createdBy: user._id,
            updatedBy: user._id,
        });
        return String(collection._id);
    };

    const eventBody = (trackId: string, extra: Record<string, unknown> = {}) => ({
        type: 'play_start',
        sessionId: session,
        trackId,
        source: 'instagram',
        ...extra,
    });

    it('отклоняет пустое, лишнее и неполное тело', async () => {
        const owner = await seedUser({ role: 'super_admin' });
        const trackId = await publishTrack(owner);
        const cases = [
            {},
            { type: 'pause', sessionId: session, trackId },
            { type: 'play_start', sessionId: 'not-a-uuid', trackId },
            { type: 'play_start', sessionId: session },
            { type: 'play_complete', sessionId: session, albumId: trackId },
            { type: 'share', sessionId: session },
            { type: 'play_start', sessionId: session, trackId, source: 'hello world' },
            { type: 'play_start', sessionId: session, trackId, note: 'лишнее' },
        ];
        for (const body of cases) {
            const res = await request(app).post('/api/music/events').send(body);
            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Некорректное событие.');
        }
        expect(await MusicEvent.countDocuments()).toBe(0);
    });

    it('не пишет черновик и неизвестный id', async () => {
        const owner = await seedUser({ role: 'super_admin' });
        const draft = await MusicTrack.create({
            title: 'Черновик',
            credits: 'Север',
            status: 'draft',
            audioKey: 'audio/draft',
            audioBytes: 8,
            createdBy: owner._id,
            updatedBy: owner._id,
        });
        const hidden = await request(app).post('/api/music/events').send(eventBody(String(draft._id)));
        expect(hidden.status).toBe(404);
        const missing = await request(app)
            .post('/api/music/events')
            .send(eventBody('aaaaaaaaaaaaaaaaaaaaaaaa'));
        expect(missing.status).toBe(404);
        expect(await MusicEvent.countDocuments()).toBe(0);
    });

    it('пишет play_start без IP и с userId, если участник вошёл', async () => {
        const owner = await seedUser({ role: 'super_admin' });
        const member = await seedUser({ role: 'user', first_name: 'Anya' });
        const trackId = await publishTrack(owner);
        const albumId = await publishCollection(owner, 'album', 'Север');
        const anon = await request(app).post('/api/music/events').send(eventBody(trackId, { albumId }));
        expect(anon.status).toBe(200);
        expect(MusicEventResponseSchema.parse(anon.body)).toEqual({ recorded: true });

        const signed = await request(app)
            .post('/api/music/events')
            .set(authHeader(member))
            .send(eventBody(trackId, { sessionId: otherSession, source: 'Instagram' }));
        expect(signed.status).toBe(200);

        const badToken = await request(app)
            .post('/api/music/events')
            .set('Authorization', 'Bearer not-a-token')
            .send(eventBody(trackId, {
                sessionId: '33333333-3333-4333-8333-333333333333',
                source: null,
            }));
        expect(badToken.status).toBe(200);

        const docs = await MusicEvent.find().sort({ createdAt: 1 }).lean();
        expect(docs).toHaveLength(3);
        expect(docs[0].source).toBe('instagram');
        expect(docs[0].albumId).toBe(albumId);
        expect(docs[0].userId).toBeNull();
        expect(docs[1].userId?.toString()).toBe(String(member._id));
        expect(docs[1].source).toBe('instagram');
        expect(docs[2].userId).toBeNull();
        expect(docs[2].source).toBeNull();
        for (const doc of docs) {
            expect(doc).not.toHaveProperty('ip');
            expect(JSON.stringify(doc)).not.toMatch(/127\.0\.0\.1|::ffff/);
        }
    });

    it('принимает text/plain так же, как sendBeacon', async () => {
        const owner = await seedUser({ role: 'super_admin' });
        const trackId = await publishTrack(owner);
        const res = await request(app)
            .post('/api/music/events')
            .set('Content-Type', 'text/plain')
            .send(JSON.stringify(eventBody(trackId, { type: 'play_complete' })));
        expect(res.status).toBe(200);
        expect(res.body.recorded).toBe(true);
        expect(await MusicEvent.countDocuments({ type: 'play_complete' })).toBe(1);
    });

    it('схлопывает повтор play_start той же записи и сессии и пускает другую запись', async () => {
        const owner = await seedUser({ role: 'super_admin' });
        const first = await publishTrack(owner, 'Ночь');
        const second = await publishTrack(owner, 'Рассвет');
        const albumId = await publishCollection(owner, 'album', 'Север');
        const start = await request(app).post('/api/music/events').send(eventBody(first, { albumId }));
        expect(start.body.recorded).toBe(true);
        const again = await request(app)
            .post('/api/music/events')
            .send(eventBody(first, { albumId: null, source: 'share' }));
        expect(again.status).toBe(200);
        expect(again.body).toEqual({ recorded: false, deduped: true });
        const otherTrack = await request(app)
            .post('/api/music/events')
            .send(eventBody(second));
        expect(otherTrack.body.recorded).toBe(true);
        const complete = await request(app)
            .post('/api/music/events')
            .send(eventBody(first, { type: 'play_complete' }));
        expect(complete.body.recorded).toBe(true);
        expect(await MusicEvent.countDocuments({ type: 'play_start', trackId: first })).toBe(1);

        await MusicEvent.deleteMany({ type: 'play_start', trackId: first });
        await MusicEvent.collection.insertOne({
            type: 'play_start',
            trackId: first,
            albumId: null,
            playlistId: null,
            source: 'vk',
            sessionId: session,
            userId: null,
            createdAt: new Date(Date.now() - MUSIC_EVENT_DEDUPE_MS - 60_000),
            updatedAt: new Date(Date.now() - MUSIC_EVENT_DEDUPE_MS - 60_000),
        });
        const afterWindow = await request(app).post('/api/music/events').send(eventBody(first));
        expect(afterWindow.body.recorded).toBe(true);
    });

    it('пишет share альбома и плейлиста и схлопывает повтор той же цели', async () => {
        const owner = await seedUser({ role: 'super_admin' });
        const albumId = await publishCollection(owner, 'album', 'Север');
        const playlistId = await publishCollection(owner, 'playlist', 'Вечер');
        const albumShare = await request(app).post('/api/music/events').send({
            type: 'share',
            sessionId: session,
            albumId,
            source: 'share',
        });
        expect(albumShare.body.recorded).toBe(true);
        const repeat = await request(app).post('/api/music/events').send({
            type: 'share',
            sessionId: session,
            albumId,
        });
        expect(repeat.body.deduped).toBe(true);
        const playlistShare = await request(app).post('/api/music/events').send({
            type: 'share',
            sessionId: session,
            playlistId,
        });
        expect(playlistShare.body.recorded).toBe(true);
        expect(await MusicEvent.countDocuments({ type: 'share' })).toBe(2);
    });

    it('не закрывается стелс-режимом календаря', async () => {
        const hidden = createTestApp({ stealthMode: true });
        const owner = await seedUser({ role: 'super_admin' });
        const trackId = await publishTrack(owner);
        const res = await request(hidden).post('/api/music/events').send(eventBody(trackId));
        expect(res.status).toBe(200);
        expect(res.body.recorded).toBe(true);
    });

    it('ограничивает частоту с одного адреса', async () => {
        for (let i = 0; i < 60; i += 1) {
            const res = await request(app).post('/api/music/events').send({});
            expect(res.status).toBe(400);
        }
        const limited = await request(app).post('/api/music/events').send({});
        expect(limited.status).toBe(429);
        expect(limited.body.message).toMatch(/Слишком много/);
    });

    it('отдаёт сводку только супер-админу и не светит сессии', async () => {
        const owner = await seedUser({ role: 'super_admin' });
        const admin = await seedUser({ role: 'admin' });
        const member = await seedUser({ role: 'user' });
        const night = await publishTrack(owner, 'Ночь');
        const dawn = await publishTrack(owner, 'Рассвет');
        const albumId = await publishCollection(owner, 'album', 'Север');
        const playlistId = await publishCollection(owner, 'playlist', 'Вечер');

        await request(app).post('/api/music/events').send(eventBody(night, { albumId, source: 'instagram' }));
        await request(app).post('/api/music/events').send(eventBody(night, { albumId, source: 'share' }));
        await request(app).post('/api/music/events').send(eventBody(night, { type: 'play_complete', albumId }));
        await request(app).post('/api/music/events').send(eventBody(dawn, {
            playlistId,
            source: null,
            sessionId: otherSession,
        }));
        await request(app).post('/api/music/events').send({
            type: 'share',
            sessionId: session,
            albumId,
            source: 'instagram',
        });
        await MusicEvent.collection.insertOne({
            type: 'play_start',
            trackId: night,
            albumId,
            playlistId: null,
            source: 'vk',
            sessionId: '44444444-4444-4444-8444-444444444444',
            userId: null,
            createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
            updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        });

        expect((await request(app).get('/api/music/admin/stats')).status).toBe(401);
        expect((await request(app).get('/api/music/admin/stats').set(authHeader(member))).status).toBe(403);
        expect((await request(app).get('/api/music/admin/stats').set(authHeader(admin))).status).toBe(403);

        const stats = await request(app).get('/api/music/admin/stats').set(authHeader(owner));
        expect(stats.status).toBe(200);
        expect(stats.headers['cache-control']).toBe('no-store');
        const body = MusicStatsResponseSchema.parse(stats.body);
        expect(body.days).toBe(7);
        expect(body.summary.plays).toBe(2);
        expect(body.summary.completes).toBe(1);
        expect(body.summary.shares).toBe(1);
        expect(body.summary.topSources).toEqual([
            { source: '', count: 1 },
            { source: 'instagram', count: 1 },
        ]);
        expect(body.summary.topTracks).toEqual([
            { trackId: night, title: 'Ночь', plays: 1 },
            { trackId: dawn, title: 'Рассвет', plays: 1 },
        ]);
        expect(body.tracks[night]).toEqual({
            plays7d: 1,
            playsAll: 2,
            completes7d: 1,
            completesAll: 1,
        });
        expect(body.tracks[dawn]).toMatchObject({ plays7d: 1, playsAll: 1, completes7d: 0 });
        expect(body.albums[albumId]).toEqual({
            plays7d: 1,
            playsAll: 2,
            completes7d: 1,
            completesAll: 1,
        });
        expect(body.playlists[playlistId]).toMatchObject({ plays7d: 1, playsAll: 1 });
        expect(JSON.stringify(body)).not.toContain(session);
        expect(body).not.toHaveProperty('userId');

        await MusicEvent.init();
        const keys = (await MusicEvent.collection.indexes()).map((index) => JSON.stringify(index.key));
        expect(keys).toContain(JSON.stringify({ createdAt: -1 }));
        expect(keys).toContain(JSON.stringify({
            sessionId: 1,
            type: 1,
            trackId: 1,
            albumId: 1,
            playlistId: 1,
            createdAt: -1,
        }));
        expect(keys).toContain(JSON.stringify({ type: 1, trackId: 1, createdAt: -1 }));
        expect(keys).toContain(JSON.stringify({ type: 1, albumId: 1, createdAt: -1 }));
        expect(keys).toContain(JSON.stringify({ type: 1, playlistId: 1, createdAt: -1 }));
    });
});
