/**
 * @file Сбрасывает одноразовый reload чанка после того, как маршрут реально смонтировался.
 */
import { useEffect, type FC } from 'react';
import { clearChunkReloadGuard } from '@/boot/chunkReload.ts';

/**
 * Стоит внутри того же Suspense, что и ленивые страницы.
 * Пока чанк не приехал, компонент не монтируется и предохранитель не сбрасывается.
 * @returns null
 */
export const ChunkReloadReset: FC = () => {
    useEffect(() => {
        clearChunkReloadGuard();
    }, []);
    return null;
};
