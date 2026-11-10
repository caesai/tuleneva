/**
 * @file Гости видят только опубликованное. Пишет только super_admin.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import request from 'supertest';
import { PublicMusicListSchema, PublicMusicTrackSchema } from '../../../shared/contracts/music';
import { MemoryObjectStorage } from '../../storage/memoryStorage';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    createTestApp,
    seedUser,
    authHeader,
} from '../helpers/testApp';

const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(32, 1)]);

describe('music API', () => {
    let app;
    let storage: MemoryObjectStorage;

    beforeAll(async () => {
        await connectTestDb();
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
        storage = new MemoryObjectStorage();
        app = createTestApp({ objectStorage: storage });
    });

    const upload = (user, fields: { title?: string; credits?: string } = {}) => request(app)
        .post('/api/music/tracks')
        .set(authHeader(user))
        .field('title', fields.title ?? 'Ночь')
        .field('credits', fields.credits ?? 'Север')
        .field('description', 'Тихий дубль')
        .attach('audio', mp3, 'night.mp3');

    it('прячет черновик и отдаёт опубликованное с Range', async () => {
        const superAdmin = await seedUser({ role: 'super_admin', first_name: 'Olga' });
        const admin = await seedUser({ role: 'admin', first_name: 'Ada' });
        const member = await seedUser({ role: 'user', first_name: 'Anya' });

        const denied = await upload(admin);
        expect(denied.status).toBe(403);
        expect((await upload(member)).status).toBe(403);
        expect((await request(app).post('/api/music/tracks')).status).toBe(401);

        const created = await upload(superAdmin);
        expect(created.status).toBe(201);
        expect(created.body.track.status).toBe('draft');
        const id = created.body.track.id as string;

        const hiddenList = await request(app).get('/api/music/tracks');
        expect(hiddenList.status).toBe(200);
        expect(PublicMusicListSchema.parse(hiddenList.body).tracks).toEqual([]);

        expect((await request(app).get(`/api/music/tracks/${id}`)).status).toBe(404);
        expect((await request(app).get(`/api/music/tracks/${id}/audio`)).status).toBe(404);
        expect((await request(app).get(`/api/music/tracks/${id}`).set(authHeader(admin))).status).toBe(404);

        const ownerView = await request(app)
            .get(`/api/music/tracks/${id}`)
            .set(authHeader(superAdmin));
        expect(ownerView.status).toBe(200);
        expect(ownerView.body.track.status).toBe('draft');
        expect(ownerView.body.track.audioKey).toBeUndefined();

        const published = await request(app)
            .post(`/api/music/tracks/${id}/publish`)
            .set(authHeader(superAdmin));
        expect(published.status).toBe(200);

        const list = await request(app).get('/api/music/tracks');
        const parsed = PublicMusicListSchema.parse(list.body);
        expect(parsed.tracks).toHaveLength(1);
        expect(PublicMusicTrackSchema.parse(parsed.tracks[0]).title).toBe('Ночь');
        expect(parsed.tracks[0]).not.toHaveProperty('status');

        const audio = await request(app)
            .get(`/api/music/tracks/${id}/audio`)
            .set('Range', 'bytes=0-3');
        expect(audio.status).toBe(206);
        expect(audio.headers['content-type']).toMatch(/audio\/mpeg/);
        expect(audio.headers['content-range']).toMatch(/^bytes 0-3\//);
        expect(audio.body.subarray(0, 3).toString()).toBe('ID3');

        const unpublished = await request(app)
            .post(`/api/music/tracks/${id}/unpublish`)
            .set(authHeader(admin));
        expect(unpublished.status).toBe(403);

        await request(app)
            .post(`/api/music/tracks/${id}/unpublish`)
            .set(authHeader(superAdmin));
        expect((await request(app).get('/api/music/tracks')).body.tracks).toEqual([]);
    });

    it('отклоняет HEIC и обложку больше 2 МБ с понятным текстом', async () => {
        const superAdmin = await seedUser({ role: 'super_admin' });
        const heic = Buffer.from('not-a-jpeg-heic-photo!!');
        const heicRes = await upload(superAdmin).attach('cover', heic, { filename: 'IMG.HEIC', contentType: 'image/heic' });
        expect(heicRes.status).toBe(400);
        expect(heicRes.body.message).toMatch(/JPEG, PNG или WebP/);

        const huge = Buffer.alloc(2 * 1024 * 1024 + 8);
        huge[0] = 0xff;
        huge[1] = 0xd8;
        huge[2] = 0xff;
        const hugeRes = await upload(superAdmin).attach('cover', huge, { filename: 'photo.jpg', contentType: 'image/jpeg' });
        expect(hugeRes.status).toBe(400);
        expect(hugeRes.body.message).toMatch(/больше 2 МБ/);

        const jpeg = Buffer.alloc(32);
        jpeg[0] = 0xff;
        jpeg[1] = 0xd8;
        jpeg[2] = 0xff;
        const ok = await upload(superAdmin).attach('cover', jpeg, { filename: 'photo.jpg', contentType: '' });
        expect(ok.status).toBe(201);
        expect(ok.body.track.hasCover).toBe(true);
    });

    it('отклоняет не-MP3', async () => {
        const superAdmin = await seedUser({ role: 'super_admin' });
        const res = await request(app)
            .post('/api/music/tracks')
            .set(authHeader(superAdmin))
            .field('title', 'Шум')
            .field('credits', 'Студия')
            .attach('audio', Buffer.from('this is not audio!!!!'), 'note.txt');
        expect(res.status).toBe(400);
    });

    it('без хранилища загрузка отвечает 503', async () => {
        const bare = createTestApp();
        const superAdmin = await seedUser({ role: 'super_admin' });
        const res = await request(bare)
            .post('/api/music/tracks')
            .set(authHeader(superAdmin))
            .field('title', 'Ночь')
            .field('credits', 'Север')
            .attach('audio', mp3, 'night.mp3');
        expect(res.status).toBe(503);
    });
});
