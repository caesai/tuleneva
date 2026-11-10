/**
 * @file Альбомы и плейлисты: пишет только super_admin, черновик гостю — 404.
 */
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import request from 'supertest';
import {
    PublicCatalogSchema,
    PublicCollectionSchema,
} from '../../../shared/contracts/music';
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
const jpeg = Buffer.alloc(16);
jpeg[0] = 0xff;
jpeg[1] = 0xd8;
jpeg[2] = 0xff;

describe('music collections', () => {
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

    const upload = (user, title: string) => request(app)
        .post('/api/music/tracks')
        .set(authHeader(user))
        .field('title', title)
        .field('credits', 'Студия')
        .attach('audio', mp3, `${title}.mp3`);

    const publishTrack = (user, id: string) => request(app)
        .post(`/api/music/tracks/${id}/publish`)
        .set(authHeader(user));

    it('не пускает обычного админа и прячет черновик', async () => {
        const superAdmin = await seedUser({ role: 'super_admin', first_name: 'Olga' });
        const admin = await seedUser({ role: 'admin', first_name: 'Ada' });

        const denied = await request(app)
            .post('/api/music/admin/collections')
            .set(authHeader(admin))
            .send({ type: 'album', title: 'Ночь' });
        expect(denied.status).toBe(403);
        expect((await request(app).post('/api/music/admin/collections').send({ type: 'album', title: 'Ночь' })).status).toBe(401);

        const created = await request(app)
            .post('/api/music/admin/collections')
            .set(authHeader(superAdmin))
            .send({ type: 'album', title: 'Ночь', description: 'Первый' });
        expect(created.status).toBe(201);
        expect(created.body.collection.status).toBe('draft');
        expect(created.body.collection.type).toBe('album');
        const id = created.body.collection.id as string;

        expect((await request(app).get(`/api/music/collections/${id}`)).status).toBe(404);
        expect((await request(app).get(`/api/music/collections/${id}`).set(authHeader(admin))).status).toBe(404);

        const owner = await request(app)
            .get(`/api/music/collections/${id}`)
            .set(authHeader(superAdmin));
        expect(owner.status).toBe(200);
        expect(owner.body.collection.status).toBe('draft');

        const catalog = PublicCatalogSchema.parse((await request(app).get('/api/music/catalog')).body);
        expect(catalog.collections).toEqual([]);
    });

    it('публикует альбом, держит порядок и оставляет запись только в одном альбоме', async () => {
        const superAdmin = await seedUser({ role: 'super_admin' });
        const night = await upload(superAdmin, 'Ночь');
        const day = await upload(superAdmin, 'День');
        const draft = await upload(superAdmin, 'Черновик');
        expect(night.status).toBe(201);
        await publishTrack(superAdmin, night.body.track.id);
        await publishTrack(superAdmin, day.body.track.id);

        const album = await request(app)
            .post('/api/music/admin/collections')
            .set(authHeader(superAdmin))
            .send({ type: 'album', title: 'Север' });
        const other = await request(app)
            .post('/api/music/admin/collections')
            .set(authHeader(superAdmin))
            .send({ type: 'album', title: 'Юг' });
        const playlist = await request(app)
            .post('/api/music/admin/collections')
            .set(authHeader(superAdmin))
            .send({ type: 'playlist', title: 'Вечер' });
        const albumId = album.body.collection.id as string;
        const otherId = other.body.collection.id as string;
        const playlistId = playlist.body.collection.id as string;

        const ordered = await request(app)
            .put(`/api/music/admin/collections/${albumId}/tracks`)
            .set(authHeader(superAdmin))
            .send({
                trackIds: [day.body.track.id, night.body.track.id, draft.body.track.id],
            });
        expect(ordered.status).toBe(200);
        expect(ordered.body.collection.tracks.map((track) => track.title)).toEqual(['День', 'Ночь', 'Черновик']);

        const moved = await request(app)
            .put(`/api/music/admin/collections/${otherId}/tracks`)
            .set(authHeader(superAdmin))
            .send({ trackIds: [night.body.track.id] });
        expect(moved.status).toBe(200);

        const first = await request(app)
            .get('/api/music/admin/collections')
            .set(authHeader(superAdmin));
        const north = first.body.collections.find((item) => item.id === albumId);
        expect(north.tracks.map((track) => track.title)).toEqual(['День', 'Черновик']);

        await request(app)
            .put(`/api/music/admin/collections/${playlistId}/tracks`)
            .set(authHeader(superAdmin))
            .send({ trackIds: [night.body.track.id, day.body.track.id] });

        await request(app).post(`/api/music/admin/collections/${albumId}/publish`).set(authHeader(superAdmin));
        await request(app).post(`/api/music/admin/collections/${playlistId}/publish`).set(authHeader(superAdmin));

        const hiddenOther = await request(app).get(`/api/music/collections/${otherId}`);
        expect(hiddenOther.status).toBe(404);

        const published = PublicCollectionSchema.parse(
            (await request(app).get(`/api/music/collections/${albumId}`)).body.collection,
        );
        expect(published.tracks.map((track) => track.title)).toEqual(['День']);
        expect(published.tracks[0].albumId).toBe(albumId);
        expect(published.trackCount).toBe(1);

        const playlistView = PublicCollectionSchema.parse(
            (await request(app).get(`/api/music/collections/${playlistId}`)).body.collection,
        );
        expect(playlistView.tracks.map((track) => track.title)).toEqual(['Ночь', 'День']);

        const catalog = PublicCatalogSchema.parse((await request(app).get('/api/music/catalog')).body);
        expect(catalog.collections.map((item) => item.title).sort()).toEqual(['Вечер', 'Север']);
        expect(catalog.singles).toEqual([]);

        const loose = await upload(superAdmin, 'Одна');
        await publishTrack(superAdmin, loose.body.track.id);
        const withSingle = PublicCatalogSchema.parse((await request(app).get('/api/music/catalog')).body);
        expect(withSingle.singles.map((track) => track.title)).toEqual(['Одна']);

        await request(app)
            .delete(`/api/music/tracks/${day.body.track.id}`)
            .set(authHeader(superAdmin));
        const afterDelete = await request(app)
            .get(`/api/music/collections/${albumId}`);
        expect(afterDelete.body.collection.tracks).toEqual([]);
    });

    it('принимает обложку JPEG и отклоняет HEIC', async () => {
        const superAdmin = await seedUser({ role: 'super_admin' });
        const created = await request(app)
            .post('/api/music/admin/collections')
            .set(authHeader(superAdmin))
            .send({ type: 'playlist', title: 'Дорога' });
        const id = created.body.collection.id as string;

        const heic = await request(app)
            .patch(`/api/music/admin/collections/${id}`)
            .set(authHeader(superAdmin))
            .field('title', 'Дорога')
            .attach('cover', Buffer.from('not-a-jpeg'), { filename: 'IMG.HEIC', contentType: 'image/heic' });
        expect(heic.status).toBe(400);
        expect(heic.body.message).toMatch(/JPEG, PNG или WebP/);

        const saved = await request(app)
            .patch(`/api/music/admin/collections/${id}`)
            .set(authHeader(superAdmin))
            .field('title', 'Дорога')
            .attach('cover', jpeg, { filename: 'cover.jpg', contentType: 'image/jpeg' });
        expect(saved.status).toBe(200);
        expect(saved.body.collection.hasCover).toBe(true);

        await request(app).post(`/api/music/admin/collections/${id}/publish`).set(authHeader(superAdmin));
        const cover = await request(app).get(`/api/music/collections/${id}/cover`);
        expect(cover.status).toBe(200);
        expect(cover.headers['content-type']).toMatch(/image\/jpeg/);
        expect(cover.body[0]).toBe(0xff);
    });

    it('кладёт новую запись в выбранный альбом', async () => {
        const superAdmin = await seedUser({ role: 'super_admin' });
        const album = await request(app)
            .post('/api/music/admin/collections')
            .set(authHeader(superAdmin))
            .send({ type: 'album', title: 'Север' });
        const created = await upload(superAdmin, 'Ночь')
            .field('albumId', album.body.collection.id);
        expect(created.status).toBe(201);
        expect(created.body.track.albumId).toBe(album.body.collection.id);
        expect(created.body.track.albumTitle).toBe('Север');

        const missing = await upload(superAdmin, 'Пусто')
            .field('albumId', '507f1f77bcf86cd799439011');
        expect(missing.status).toBe(400);
        expect(missing.body.message).toMatch(/Альбом не найден/);
    });
});
