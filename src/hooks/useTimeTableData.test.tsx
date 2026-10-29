/**
 * @file Push booking_update не пишет публичные hours в bookedHours —
 * слоты приходят только из GET /api/hours.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import moment from '@/lib/moment';
import type { WebSocketCallback, WebSocketMessage } from './useWebSocket';

const mockGetTimeTable = vi.fn();
const mockGetHours = vi.fn();
let capturedOnMessage: WebSocketCallback | undefined;

vi.mock('@/api/timetable.api.ts', () => ({
    APIGetTimeTable: (...args: unknown[]) => mockGetTimeTable(...args),
    APIGetHours: (...args: unknown[]) => mockGetHours(...args),
}));

vi.mock('./useWebSocket', () => ({
    useWebSocket: (options: { onMessage?: WebSocketCallback }) => {
        capturedOnMessage = options.onMessage;
        return { isConnected: true, lastMessage: null, reconnect: vi.fn() };
    },
}));

import { useTimeTableData } from './useTimeTableData';

/**
 * Ответ fetch-подобного API.
 * @param body - JSON-тело
 * @returns Response-like
 */
const jsonResponse = (body: object) =>
    Promise.resolve({
        ok: true,
        json: async () => body,
    });

describe('useTimeTableData slot visibility', () => {
    beforeEach(() => {
        capturedOnMessage = undefined;
        mockGetTimeTable.mockReset();
        mockGetHours.mockReset();
        Object.defineProperty(navigator, 'onLine', {
            configurable: true,
            get: () => true,
        });

        mockGetTimeTable.mockImplementation(() =>
            jsonResponse({ result: ['15/06/2030'] }),
        );
        mockGetHours.mockImplementation(() =>
            jsonResponse({
                hours: [
                    {
                        hour: '15:00',
                        rehearsalType: 'rehearsal',
                        username: 'full_user',
                        band_name: 'Band From Api',
                    },
                ],
            }),
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('refetches day hours on booking push and ignores WS hour payload', async () => {
        const viewMonth = moment.utc('01/06/2030', 'DD/MM/YYYY');
        const selected = moment.utc('15/06/2030', 'DD/MM/YYYY');

        const { result } = renderHook(() =>
            useTimeTableData(viewMonth, selected, true),
        );

        await waitFor(() => {
            expect(result.current.bookedHours).toEqual([
                {
                    hour: '15:00',
                    rehearsalType: 'rehearsal',
                    username: 'full_user',
                    band_name: 'Band From Api',
                },
            ]);
        });

        expect(mockGetHours).toHaveBeenCalled();
        const callsAfterLoad = mockGetHours.mock.calls.length;

        const publicPush: WebSocketMessage = {
            type: 'booking_update',
            data: {
                date: '15/06/2030',
                hours: [{ hour: '16:00', rehearsalType: 'rehearsal' }],
            },
            timestamp: Date.now(),
        };

        mockGetHours.mockImplementationOnce(() =>
            jsonResponse({
                hours: [
                    {
                        hour: '15:00',
                        rehearsalType: 'rehearsal',
                        username: 'full_user',
                        band_name: 'Band From Api',
                    },
                    {
                        hour: '16:00',
                        rehearsalType: 'rehearsal',
                        username: 'other',
                        band_name: 'Other Band',
                    },
                ],
            }),
        );

        expect(capturedOnMessage).toBeTypeOf('function');
        await act(async () => {
            capturedOnMessage?.(publicPush);
        });

        await waitFor(() => {
            expect(mockGetHours.mock.calls.length).toBeGreaterThan(callsAfterLoad);
        });

        await waitFor(() => {
            expect(result.current.bookedHours).toEqual([
                {
                    hour: '15:00',
                    rehearsalType: 'rehearsal',
                    username: 'full_user',
                    band_name: 'Band From Api',
                },
                {
                    hour: '16:00',
                    rehearsalType: 'rehearsal',
                    username: 'other',
                    band_name: 'Other Band',
                },
            ]);
        });

        expect(result.current.bookedHours.some((h) => !h.username)).toBe(false);
    });
});
