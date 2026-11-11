import { useEffect, useState } from 'react';

/** Пауза перед скелетом: быстрый ответ не должен мигать. */
export const SKELETON_DELAY_MS = 180;

/**
 * Включает скелет только если ожидание затянулось.
 * Повторная загрузка при уже показанных данных скелет не включает.
 * @param pending Ждём данные и показывать ещё нечего
 * @returns true, когда скелет можно показать
 */
export const useDeferredSkeleton = (pending: boolean): boolean => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!pending) {
            setVisible(false);
            return undefined;
        }
        const timer = window.setTimeout(() => setVisible(true), SKELETON_DELAY_MS);
        return () => window.clearTimeout(timer);
    }, [pending]);

    return pending && visible;
};
