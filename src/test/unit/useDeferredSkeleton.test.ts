import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { SKELETON_DELAY_MS, useDeferredSkeleton } from '@/hooks/useDeferredSkeleton';

describe('useDeferredSkeleton', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('не показывает скелет, если ответ пришёл быстрее паузы', () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(({ pending }) => useDeferredSkeleton(pending), {
            initialProps: { pending: true },
        });
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(result.current).toBe(false);
        rerender({ pending: false });
        act(() => {
            vi.advanceTimersByTime(SKELETON_DELAY_MS);
        });
        expect(result.current).toBe(false);
    });

    it('показывает скелет после паузы и прячет сразу, когда данные есть', () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(({ pending }) => useDeferredSkeleton(pending), {
            initialProps: { pending: true },
        });
        act(() => {
            vi.advanceTimersByTime(SKELETON_DELAY_MS);
        });
        expect(result.current).toBe(true);
        rerender({ pending: false });
        expect(result.current).toBe(false);
    });
});
