/**
 * @file Версия байтов в URL обложки и MP3. Старый ответ без номера остаётся на нуле.
 */
import { describe, expect, it } from 'vitest';
import { collectionCoverUrl, trackAudioUrl, trackCoverUrl } from '@/api/music.api.ts';

describe('music media urls', () => {
    it('добавляет v и подставляет 0, если версии нет', () => {
        expect(trackAudioUrl('abc', 3)).toBe('/api/music/tracks/abc/audio?v=3');
        expect(trackCoverUrl('abc', 2)).toBe('/api/music/tracks/abc/cover?v=2');
        expect(collectionCoverUrl('alb', 4)).toBe('/api/music/collections/alb/cover?v=4');
        expect(trackAudioUrl('abc')).toBe('/api/music/tracks/abc/audio?v=0');
        expect(trackCoverUrl('abc', null)).toBe('/api/music/tracks/abc/cover?v=0');
        expect(collectionCoverUrl('alb', -1)).toBe('/api/music/collections/alb/cover?v=0');
        expect(trackAudioUrl('abc', 1.5)).toBe('/api/music/tracks/abc/audio?v=0');
    });
});
