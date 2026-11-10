/**
 * @file Верхняя граница: ошибка рендера показывает «Обновить», а не пустой корень.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppErrorBoundary } from '@/components/AppErrorBoundary/AppErrorBoundary.tsx';
import {
    CHUNK_RELOAD_KEY,
    resetChunkReloadForTests,
    setChunkReloader,
} from '@/boot/chunkReload.ts';

const Boom = ({ message }: { message: string }) => {
    throw new Error(message);
};

describe('AppErrorBoundary', () => {
    it('показывает короткое сообщение и кнопку обновления', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        render(
            <AppErrorBoundary>
                <Boom message="render failed" />
            </AppErrorBoundary>,
        );

        expect(screen.getByRole('alert')).toHaveTextContent('Не удалось открыть приложение.');
        expect(screen.getByRole('button', { name: 'Обновить' })).toBeEnabled();
        expect(sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
    });

    it('на ошибке чанка держит лоадер и запрашивает один reload', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const reload = vi.fn();
        resetChunkReloadForTests();
        setChunkReloader(reload);
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);

        render(
            <AppErrorBoundary>
                <Boom message="Failed to fetch dynamically imported module: /assets/Admin-old.js" />
            </AppErrorBoundary>,
        );

        expect(reload).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('img', { name: 'Tuleneva 25' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Обновить' })).not.toBeInTheDocument();
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    });
});
