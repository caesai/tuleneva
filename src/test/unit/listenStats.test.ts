/**
 * @file Метка источника, дедупликация событий и тот же номер счётчика, что в HTML.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { YANDEX_METRIKA_COUNTER_ID } from '@/config/metrika.ts';
import {
    captureListenSource,
    readListenSource,
    recordMusicEvent,
    withShareSource,
} from '@/music/listenStats.ts';
import { MUSIC_EVENT_DEDUPE_MS } from '../../../shared/musicListen.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('listenStats', () => {
    beforeEach(() => {
        localStorage.removeItem('tuleneva:music-session');
        localStorage.removeItem('tuleneva:music-dedupe');
        localStorage.removeItem('authToken');
        sessionStorage.clear();
        delete (window as Window & { ym?: unknown }).ym;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('берёт from, иначе utm_source, и не затирает метку пустым заходом', () => {
        captureListenSource('?utm_source=Telegram');
        expect(readListenSource()).toBe('telegram');
        captureListenSource('?from=Instagram&utm_source=vk');
        expect(readListenSource()).toBe('instagram');
        captureListenSource('?from=hello world');
        expect(readListenSource()).toBe('instagram');
        captureListenSource('');
        expect(readListenSource()).toBe('instagram');
    });

    it('кладёт from=share в ссылку, которой делятся', () => {
        expect(withShareSource('https://tuleneva25.ru/music/album/alb')).toBe(
            'https://tuleneva25.ru/music/album/alb?from=share',
        );
    });

    it('шлёт событие и reachGoal, повтор в окне молчит, без ym не падает', () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        vi.stubGlobal('fetch', fetchMock);
        captureListenSource('?from=share');
        recordMusicEvent('play_start', { trackId: 'a', albumId: 'b' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(init.method).toBe('POST');
        expect(init.keepalive).toBe(true);
        expect(JSON.parse(String(init.body))).toMatchObject({
            type: 'play_start',
            trackId: 'a',
            albumId: 'b',
            source: 'share',
        });

        recordMusicEvent('play_start', { trackId: 'a' });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        delete (window as Window & { ym?: unknown }).ym;
        localStorage.removeItem('tuleneva:music-dedupe');
        recordMusicEvent('play_complete', { trackId: 'a' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('зовёт ym тем же id, что в шаблоне страницы, и sendBeacon на уходе', () => {
        const html = readFileSync(path.join(root, 'index.template.html'), 'utf8');
        const built = readFileSync(path.join(root, 'index.html'), 'utf8');
        expect(html).toContain(String(YANDEX_METRIKA_COUNTER_ID));
        expect(built).toContain(String(YANDEX_METRIKA_COUNTER_ID));
        expect(YANDEX_METRIKA_COUNTER_ID).toBe(98668551);

        const fetchMock = vi.fn().mockResolvedValue({ ok: true });
        const beacon = vi.fn().mockReturnValue(true);
        vi.stubGlobal('fetch', fetchMock);
        Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon });
        const ym = vi.fn();
        (window as Window & { ym?: typeof ym }).ym = ym;

        recordMusicEvent('share', { playlistId: 'pl' }, { beacon: true });
        expect(beacon).toHaveBeenCalledWith('/api/music/events', expect.any(Blob));
        expect(fetchMock).not.toHaveBeenCalled();
        expect(ym).toHaveBeenCalledWith(YANDEX_METRIKA_COUNTER_ID, 'reachGoal', 'share', {
            trackId: '',
            source: '',
        });

        localStorage.removeItem('tuleneva:music-dedupe');
        vi.spyOn(Date, 'now').mockReturnValue(1_000);
        recordMusicEvent('play_start', { trackId: 'late' });
        vi.spyOn(Date, 'now').mockReturnValue(1_000 + MUSIC_EVENT_DEDUPE_MS + 5);
        recordMusicEvent('play_start', { trackId: 'late' });
        expect(beacon).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
