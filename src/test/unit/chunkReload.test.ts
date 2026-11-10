/**
 * @file Предохранитель автообновления при битом чанке.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    CHUNK_RELOAD_KEY,
    clearChunkReloadGuard,
    isChunkLoadError,
    reloadOnceForChunkError,
    resetChunkReloadForTests,
    setChunkReloader,
} from '@/boot/chunkReload.ts';

describe('chunk reload', () => {
    afterEach(() => {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
        resetChunkReloadForTests();
    });

    it('узнаёт ошибку динамического импорта', () => {
        expect(isChunkLoadError(
            new TypeError('Failed to fetch dynamically imported module: /assets/AdminPage-old.js'),
        )).toBe(true);
        expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
        expect(isChunkLoadError(new Error('Expected JavaScript module but got text/html'))).toBe(true);
        expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    });

    it('перезагружает один раз и больше не трогает reload', () => {
        const reload = vi.fn();
        setChunkReloader(reload);

        expect(reloadOnceForChunkError()).toBe(true);
        expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe('1');
        expect(reload).toHaveBeenCalledTimes(1);

        expect(reloadOnceForChunkError()).toBe(true);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('после записанного флага не перезагружает снова', () => {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        resetChunkReloadForTests();
        const reload = vi.fn();
        setChunkReloader(reload);

        expect(reloadOnceForChunkError()).toBe(false);
        expect(reload).not.toHaveBeenCalled();

        clearChunkReloadGuard();
        expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
    });
});
