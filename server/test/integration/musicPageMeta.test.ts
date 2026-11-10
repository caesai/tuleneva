/**
 * @file Open Graph для /music: альбом, плейлист, неизвестный id и JPEG 1200×630.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import MusicCollection from '../../models/MusicCollection';
import MusicTrack from '../../models/MusicTrack';
import { MemoryObjectStorage } from '../../storage/memoryStorage';
import {
    clearTestDb,
    connectTestDb,
    createTestApp,
    disconnectTestDb,
    seedUser,
} from '../helpers/testApp';

const INDEX_HTML = [
    '<!doctype html><html><head>',
    '<meta charset="UTF-8" />',
    '<!-- tuleneva:page-meta -->',
    '<title>old</title>',
    '<!-- /tuleneva:page-meta -->',
    '</head><body><div id="root"></div></body></html>',
].join('');

const COVER_KEY = 'music/collections/aaaaaaaaaaaaaaaaaaaaaaaa/cover.jpg';

describe('music page meta', () => {
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
        const jpeg = await sharp({
            create: {
                width: 32,
                height: 32,
                channels: 3,
                background: { r: 180, g: 30, b: 40 },
            },
        }).jpeg().toBuffer();
        await storage.put(COVER_KEY, jpeg, 'image/jpeg');
        app = createTestApp({
            objectStorage: storage,
            indexHtml: INDEX_HTML,
        });
    });

    it('serves catalog meta for /music', async () => {
        const res = await request(app).get('/music');

        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
        expect(res.text).toContain('<title>Музыка — Тюленева 25</title>');
        expect(res.text).toContain('href="https://test.example/music"');
        expect(res.text).toContain('content="https://test.example/music"');
        expect(res.text).toContain('content="https://test.example/og-share.jpg"');
        expect(res.text).toContain('content="1200"');
        expect(res.text).toContain('content="630"');
        expect(res.text).toContain('<div id="root"></div>');
    });

    it('injects escaped album meta and a public share image', async () => {
        const user = await seedUser({ role: 'super_admin' });
        const album = await MusicCollection.create({
            type: 'album',
            title: 'A & B <script>',
            description: 'say "hi"',
            status: 'published',
            coverKey: COVER_KEY,
            coverContentType: 'image/jpeg',
            trackIds: [],
            createdBy: user._id,
            updatedBy: user._id,
        });

        const page = await request(app).get(`/music/album/${album._id.toString()}`);
        const imageUrl = `https://test.example/api/music/collections/${album._id.toString()}/og.jpg`;

        expect(page.status).toBe(200);
        expect(page.headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
        expect(page.text).toContain('A &amp; B &lt;script&gt;');
        expect(page.text).toContain('say &quot;hi&quot;');
        expect(page.text).not.toContain('<script>');
        expect(page.text).toContain('content="music.album"');
        expect(page.text).toContain(`href="https://test.example/music/album/${album._id.toString()}"`);
        expect(page.text).toContain(`content="${imageUrl}"`);
        expect(page.text).toContain('property="music:musician"');
        expect(page.text).toContain('<div id="root"></div>');

        const image = await request(app)
            .get(`/api/music/collections/${album._id.toString()}/og.jpg`)
            .buffer(true)
            .parse((res, callback) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
                res.on('end', () => callback(null, Buffer.concat(chunks)));
            });
        expect(image.status).toBe(200);
        expect(image.headers['content-type']).toMatch(/image\/jpeg/);
        expect(image.headers['cache-control']).toBe('public, max-age=86400');
        const meta = await sharp(image.body).metadata();
        expect(meta.width).toBe(1200);
        expect(meta.height).toBe(630);
    });

    it('uses playlist meta and the default image when there is no cover', async () => {
        const user = await seedUser({ role: 'super_admin' });
        const playlist = await MusicCollection.create({
            type: 'playlist',
            title: 'Вечер',
            description: '',
            status: 'published',
            trackIds: [],
            createdBy: user._id,
            updatedBy: user._id,
        });

        const page = await request(app).get(`/music/playlist/${playlist._id.toString()}`);

        expect(page.status).toBe(200);
        expect(page.text).toContain('<title>Вечер — Тюленева 25</title>');
        expect(page.text).toContain('content="music.playlist"');
        expect(page.text).toContain(`content="https://test.example/music/playlist/${playlist._id.toString()}"`);
        expect(page.text).toContain('content="https://test.example/og-share.jpg"');
        expect(page.text).toContain('Плейлист «Вечер»');
    });

    it('returns catalog meta for an unknown id and a draft', async () => {
        const user = await seedUser({ role: 'super_admin' });
        const draft = await MusicCollection.create({
            type: 'album',
            title: 'SECRET DRAFT',
            description: 'hidden',
            status: 'draft',
            coverKey: COVER_KEY,
            coverContentType: 'image/jpeg',
            trackIds: [],
            createdBy: user._id,
            updatedBy: user._id,
        });

        const unknown = await request(app).get('/music/album/000000000000000000000001');
        const unpublished = await request(app).get(`/music/album/${draft._id.toString()}`);
        const image = await request(app).get(`/api/music/collections/${draft._id.toString()}/og.jpg`);

        expect(unknown.status).toBe(200);
        expect(unknown.text).toContain('<title>Музыка — Тюленева 25</title>');
        expect(unknown.text).toContain('content="https://test.example/music"');
        expect(unknown.text).not.toContain('/music/album/000000000000000000000001');
        expect(unpublished.status).toBe(200);
        expect(unpublished.text).not.toContain('SECRET DRAFT');
        expect(unpublished.text).not.toContain('hidden');
        expect(image.status).toBe(404);
    });

    it('injects a published track and keeps an unknown track on the catalog', async () => {
        const user = await seedUser({ role: 'super_admin' });
        const track = await MusicTrack.create({
            title: 'Сингл',
            credits: 'Студия',
            description: '',
            status: 'published',
            audioKey: 'music/bbbbbbbbbbbbbbbbbbbbbbbb/audio.mp3',
            audioBytes: 32,
            createdBy: user._id,
            updatedBy: user._id,
        });

        const page = await request(app).get(`/music/${track._id.toString()}`);
        const missing = await request(app).get('/music/not-an-id');

        expect(page.status).toBe(200);
        expect(page.text).toContain('content="music.song"');
        expect(page.text).toContain(`content="https://test.example/music/${track._id.toString()}"`);
        expect(missing.status).toBe(200);
        expect(missing.text).toContain('<title>Музыка — Тюленева 25</title>');
        expect(missing.text).not.toContain('not-an-id');
    });
});
