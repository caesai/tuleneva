/**
 * @file Сигнатуры MP3 и обложки, границы текста.
 */
import { describe, expect, it } from 'vitest';
import {
    COVER_BAD_TYPE_MESSAGE,
    COVER_TOO_BIG_MESSAGE,
    detectCover,
    isMp3,
    parseMusicText,
    readCover,
} from '../../music/musicValidation';
import { COVER_MAX_BYTES } from '../../music/musicLimits';
import { parseRangeHeader } from '../../music/musicRoutes';

describe('musicValidation', () => {
    it('принимает ID3 и синхрокадр, отвергает WAV', () => {
        const id3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)]);
        const frame = Buffer.alloc(16);
        frame[0] = 0xff;
        frame[1] = 0xfb;
        const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(20)]);
        expect(isMp3(id3)).toBe(true);
        expect(isMp3(frame)).toBe(true);
        expect(isMp3(wav)).toBe(false);
        expect(isMp3(Buffer.from('short'))).toBe(false);
    });

    it('узнаёт jpeg, png и webp', () => {
        const jpeg = Buffer.alloc(16);
        jpeg[0] = 0xff;
        jpeg[1] = 0xd8;
        jpeg[2] = 0xff;
        const png = Buffer.alloc(16);
        png.set([0x89, 0x50, 0x4e, 0x47], 0);
        const webp = Buffer.alloc(16);
        webp.write('RIFF', 0);
        webp.write('WEBP', 8);
        expect(detectCover(jpeg)?.contentType).toBe('image/jpeg');
        expect(detectCover(png)?.extension).toBe('png');
        expect(detectCover(webp)?.extension).toBe('webp');
        expect(detectCover(Buffer.from('ID3............'))).toBeNull();
        const huge = Buffer.alloc(COVER_MAX_BYTES + 1);
        huge[0] = 0xff;
        huge[1] = 0xd8;
        huge[2] = 0xff;
        expect(detectCover(huge)).toBeNull();
        expect(readCover(huge)).toEqual({ ok: false, message: COVER_TOO_BIG_MESSAGE });
        expect(readCover(Buffer.from('ftypheic-not-a-photo'))).toEqual({
            ok: false,
            message: COVER_BAD_TYPE_MESSAGE,
        });
        const accepted = readCover(jpeg);
        expect(accepted.ok).toBe(true);
    });

    it('требует название и авторов', () => {
        expect(parseMusicText({ title: '  ', credits: 'Север' }).ok).toBe(false);
        const ok = parseMusicText({ title: 'Ночь', credits: 'Север', description: '' });
        expect(ok.ok).toBe(true);
        if (ok.ok) {
            expect(ok.value.description).toBe('');
        }
    });
});

describe('parseRangeHeader', () => {
    it('разбирает диапазон и суффикс', () => {
        expect(parseRangeHeader(undefined, 100)).toBeNull();
        expect(parseRangeHeader('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
        expect(parseRangeHeader('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
        expect(parseRangeHeader('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
        expect(parseRangeHeader('bytes=100-120', 100)).toBe('unsatisfiable');
    });
});
