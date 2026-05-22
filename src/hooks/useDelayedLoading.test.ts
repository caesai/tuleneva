import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDelayedLoading } from '@/hooks/useDelayedLoading.ts';

describe('useDelayedLoading', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows loader immediately when showDelayMs is 0', () => {
        const { result } = renderHook(() => useDelayedLoading(true));

        expect(result.current).toBe(true);
    });

    it('does not show loader before showDelayMs when delay is set', () => {
        const { result } = renderHook(() => useDelayedLoading(true, { showDelayMs: 200, minVisibleMs: 400 }));

        expect(result.current).toBe(false);
        act(() => vi.advanceTimersByTime(199));
        expect(result.current).toBe(false);
        act(() => vi.advanceTimersByTime(1));
        expect(result.current).toBe(true);
    });

    it('keeps loader visible for minVisibleMs after loading ends', () => {
        const { result, rerender } = renderHook(
            ({ loading }) => useDelayedLoading(loading, { showDelayMs: 0, minVisibleMs: 400 }),
            { initialProps: { loading: true } },
        );

        act(() => vi.advanceTimersByTime(0));
        expect(result.current).toBe(true);
        rerender({ loading: false });
        expect(result.current).toBe(true);
        act(() => vi.advanceTimersByTime(399));
        expect(result.current).toBe(true);
        act(() => vi.advanceTimersByTime(1));
        expect(result.current).toBe(false);
    });

    it('never shows loader if loading finishes before showDelayMs', () => {
        const { result, rerender } = renderHook(
            ({ loading }) => useDelayedLoading(loading, { showDelayMs: 200, minVisibleMs: 400 }),
            { initialProps: { loading: true } },
        );

        act(() => vi.advanceTimersByTime(100));
        rerender({ loading: false });
        act(() => vi.advanceTimersByTime(500));
        expect(result.current).toBe(false);
    });

    it('keeps loader after short load when showDelayMs is 0', () => {
        const { result, rerender } = renderHook(
            ({ loading }) => useDelayedLoading(loading, { showDelayMs: 0, minVisibleMs: 400 }),
            { initialProps: { loading: true } },
        );

        expect(result.current).toBe(true);
        rerender({ loading: false });
        expect(result.current).toBe(true);
        act(() => vi.advanceTimersByTime(400));
        expect(result.current).toBe(false);
    });
});
