/**
 * @file Сжатие обложки: длинная сторона, JPEG и отказ, если фото не открылось.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    COVER_PREPARE_FAILED_MESSAGE,
    COVER_UNREADABLE_MESSAGE,
    prepareCoverFile,
} from '@/music/prepareCover.ts';

const stubCanvas = (blobs: Blob[]) => {
    const sizes: Array<{ width: number; height: number }> = [];
    let index = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function context(this: HTMLCanvasElement) {
        sizes.push({ width: this.width, height: this.height });
        return { drawImage: () => undefined } as unknown as CanvasRenderingContext2D;
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
        const blob = blobs[Math.min(index, blobs.length - 1)];
        index += 1;
        callback(blob);
    });
    return sizes;
};

describe('prepareCoverFile', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('ужимает широкий кадр до 1500px и отдаёт JPEG', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
            width: 4032,
            height: 3024,
            close: () => undefined,
        })));
        const sizes = stubCanvas([new Blob([new Uint8Array(80_000)], { type: 'image/jpeg' })]);
        const file = new File([new Uint8Array(8)], 'IMG_2042.HEIC', { type: '' });

        const prepared = await prepareCoverFile(file);

        expect(prepared.type).toBe('image/jpeg');
        expect(prepared.name).toBe('IMG_2042.jpg');
        expect(prepared.size).toBe(80_000);
        expect(sizes[0]).toEqual({ width: 1500, height: 1125 });
    });

    it('снижает качество и размер, пока JPEG не влезет в 2 МБ', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
            width: 2000,
            height: 2000,
            close: () => undefined,
        })));
        const heavy = new Blob([new Uint8Array(2 * 1024 * 1024 + 10)]);
        const light = new Blob([new Uint8Array(40_000)], { type: 'image/jpeg' });
        const sizes = stubCanvas([heavy, heavy, heavy, heavy, light]);

        const prepared = await prepareCoverFile(new File([new Uint8Array(4)], 'photo.jpg', { type: 'image/jpeg' }));

        expect(prepared.size).toBe(40_000);
        expect(sizes.map((size) => size.width)).toEqual([1500, 1100]);
    });

    it('сообщает по-русски, если браузер не открыл файл', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn(async () => {
            throw new Error('heic');
        }));
        vi.stubGlobal('Image', class {
            onload: (() => void) | null = null;

            onerror: (() => void) | null = null;

            set src(_value: string) {
                this.onerror?.();
            }
        });
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cover');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

        const file = new File([new Uint8Array(4)], 'IMG.HEIC', { type: 'image/heic' });
        await expect(prepareCoverFile(file)).rejects.toThrow(COVER_UNREADABLE_MESSAGE);
    });

    it('сообщает, если холст недоступен', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
            width: 100,
            height: 100,
            close: () => undefined,
        })));
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

        await expect(prepareCoverFile(new File([new Uint8Array(4)], 'a.png'))).rejects.toThrow(
            COVER_PREPARE_FAILED_MESSAGE,
        );
    });
});
