/**
 * @file lazy() с одним автообновлением, если чанк маршрута не скачался.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import { isChunkLoadError, reloadOnceForChunkError } from '@/boot/chunkReload.ts';

/**
 * Как React.lazy, но ChunkLoadError один раз перезагружает документ.
 * Пока идёт reload, промис не реджектится — Suspense держит лоадер, а не белый экран.
 * Если перезаход уже был, ошибка всплывает в error boundary.
 * @param importer - Динамический import страницы
 * @returns Ленивый компонент
 */
// Сигнатура как у React.lazy: конкретные пропсы страниц здесь не нужны.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lazyWithRetry = <T extends ComponentType<any>>(
    importer: () => Promise<{ default: T }>,
): LazyExoticComponent<T> => lazy(() => importer().catch((error: unknown): Promise<{ default: T }> => {
    if (isChunkLoadError(error) && reloadOnceForChunkError()) {
        return new Promise<{ default: T }>(() => {});
    }
    return Promise.reject(error);
}));
