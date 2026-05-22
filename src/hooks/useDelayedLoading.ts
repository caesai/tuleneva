import { useEffect, useRef, useState } from 'react';

/** Тайминги лоадера по умолчанию (мс). */
export const LOADER_TIMING = {
    /** Показ сразу при старте загрузки (смена даты/месяца). */
    showDelayMs: 0,
    /** Не убирать лоадер сразу после ответа API — сглаживает UX. */
    minVisibleMs: 500,
    /** Только для Suspense (подгрузка JS-чанков). */
    suspenseShowDelayMs: 150,
} as const;

export interface IDelayedLoadingOptions {
    /** Задержка перед показом; 0 — лоадер сразу. */
    showDelayMs?: number;
    /** Минимальное время показа после появления (анти-мигание при скрытии). */
    minVisibleMs?: number;
}

/**
 * Сглаживает лоадер: показывает сразу (или с задержкой), скрывает не раньше minVisibleMs.
 * @param isLoading - Флаг загрузки из API/состояния
 * @param options - Задержки в миллисекундах
 * @returns Показывать ли лоадер в UI
 */
export const useDelayedLoading = (
    isLoading: boolean,
    options: IDelayedLoadingOptions = {},
): boolean => {
    const showDelayMs = options.showDelayMs ?? LOADER_TIMING.showDelayMs;
    const minVisibleMs = options.minVisibleMs ?? LOADER_TIMING.minVisibleMs;
    const [visible, setVisible] = useState(false);
    const shownAtRef = useRef<number | null>(null);
    const isLoadingRef = useRef(isLoading);
    /** ID таймера в браузере (DOM), не NodeJS.Timeout. */
    const hideTimerRef = useRef<number | null>(null);

    isLoadingRef.current = isLoading;

    useEffect(() => {
        const clearHideTimer = () => {
            if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
                hideTimerRef.current = null;
            }
        };

        if (isLoading) {
            clearHideTimer();

            const show = () => {
                if (!isLoadingRef.current) {
                    return;
                }
                shownAtRef.current = Date.now();
                setVisible(true);
            };

            if (visible) {
                return;
            }

            if (showDelayMs > 0) {
                const showTimer = window.setTimeout(show, showDelayMs);
                return () => clearTimeout(showTimer);
            }

            show();
            return;
        }

        if (!visible || shownAtRef.current === null) {
            clearHideTimer();
            shownAtRef.current = null;
            setVisible(false);
            return;
        }

        const elapsed = Date.now() - shownAtRef.current;
        const remaining = Math.max(0, minVisibleMs - elapsed);
        hideTimerRef.current = window.setTimeout(() => {
            hideTimerRef.current = null;
            shownAtRef.current = null;
            setVisible(false);
        }, remaining);

        return clearHideTimer;
    }, [isLoading, showDelayMs, minVisibleMs, visible]);

    return visible;
};
