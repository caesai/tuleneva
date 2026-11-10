/**
 * @file Порядок «Поделиться»: системный лист, буфер, Telegram.
 */
import { describe, expect, it, vi } from 'vitest';
import { shareLink } from '@/pages/MusicPage/shareLink.ts';

const input = { title: 'Север — Тюленева 25', url: 'https://tuleneva25.ru/music/album/alb' };

describe('shareLink', () => {
    it('вызывает Web Share и не копирует', async () => {
        const share = vi.fn().mockResolvedValue(undefined);
        const copy = vi.fn();
        await expect(shareLink(input, { share, copy })).resolves.toBe('shared');
        expect(share).toHaveBeenCalledWith(input);
        expect(copy).not.toHaveBeenCalled();
    });

    it('молча выходит, если лист закрыли', async () => {
        const abort = new Error('cancelled');
        abort.name = 'AbortError';
        const copy = vi.fn();
        await expect(shareLink(input, {
            share: () => Promise.reject(abort),
            copy,
        })).resolves.toBe('cancelled');
        expect(copy).not.toHaveBeenCalled();
    });

    it('копирует адрес, когда системного листа нет', async () => {
        const copy = vi.fn().mockResolvedValue(true);
        await expect(shareLink(input, { copy })).resolves.toBe('copied');
        expect(copy).toHaveBeenCalledWith(input.url);
    });

    it('в Mini App открывает t.me/share, если буфер не принял адрес', async () => {
        const open = vi.fn();
        await expect(shareLink(input, {
            copy: async () => false,
            open,
            inTelegram: true,
        })).resolves.toBe('telegram');
        expect(open).toHaveBeenCalledWith(
            'https://t.me/share/url?url=https%3A%2F%2Ftuleneva25.ru%2Fmusic%2Falbum%2Falb&text=%D0%A1%D0%B5%D0%B2%D0%B5%D1%80%20%E2%80%94%20%D0%A2%D1%8E%D0%BB%D0%B5%D0%BD%D0%B5%D0%B2%D0%B0%2025',
        );
    });
});
