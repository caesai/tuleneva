import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import moment from '@/lib/moment';
import { APICancelBooking, APIPostBookRehearsal } from '@/api/timetable.api.ts';
import { useTimeTableBooking } from '@/hooks/useTimeTableBooking.ts';

vi.mock('@/api/timetable.api.ts', async () => {
    const actual = await vi.importActual<typeof import('@/api/timetable.api.ts')>('@/api/timetable.api.ts');
    return {
        ...actual,
        APIPostBookRehearsal: vi.fn(),
        APICancelBooking: vi.fn(),
    };
});

const date = moment('15/06/2030', 'DD/MM/YYYY');

/**
 * Ответ брони или отмены.
 * @param status HTTP-статус
 * @param body JSON-тело
 * @returns Response
 */
const jsonResponse = (status: number, body: object) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
});

describe('useTimeTableBooking', () => {
    const fetchBookedHours = vi.fn().mockResolvedValue(undefined);
    const refetch = vi.fn();
    const showToast = vi.fn();
    const setSelectedHours = vi.fn();
    const setHoursToCancel = vi.fn();
    const closeBookingModal = vi.fn();

    const renderBooking = (selectedHours: string[] = ['14:00', '15:00']) => renderHook(() => useTimeTableBooking({
        canManageBookings: true,
        isOnline: true,
        selectedDate: date,
        selectedHours,
        hoursToCancel: ['14:00'],
        bookingBandName: '',
        rehearsalType: 'rehearsal',
        bandNames: [],
        showToast,
        fetchBookedHours,
        refetch,
        closeBookingModal,
        setSelectedHours,
        setHoursToCancel,
    }));

    beforeEach(() => {
        fetchBookedHours.mockClear();
        refetch.mockClear();
        showToast.mockClear();
        setSelectedHours.mockClear();
        setHoursToCancel.mockClear();
        closeBookingModal.mockClear();
    });

    it('drops conflicting hours and reloads the day on 409', async () => {
        vi.mocked(APIPostBookRehearsal).mockResolvedValue(jsonResponse(409, {
            error: 'Some hours are already booked.',
            conflictingHours: ['14:00'],
        }));

        const { result } = renderBooking();
        await act(async () => {
            await result.current.handleBooking();
        });

        const update = setSelectedHours.mock.calls[0][0] as (hours: string[]) => string[];
        expect(update(['14:00', '15:00'])).toEqual(['15:00']);
        expect(fetchBookedHours).toHaveBeenCalledWith(date);
        expect(refetch).toHaveBeenCalled();
        expect(closeBookingModal).not.toHaveBeenCalled();
        expect(showToast).toHaveBeenCalledWith('Это время уже занято.', 'error');
    });

    it('clears the cancel selection and reloads when the slot changed', async () => {
        vi.mocked(APICancelBooking).mockResolvedValue(jsonResponse(409, {
            error: 'Selected bookings changed. Refresh and try again.',
        }));

        const { result } = renderBooking();
        await act(async () => {
            await result.current.handleCancel();
        });

        expect(setHoursToCancel).toHaveBeenCalledWith([]);
        expect(fetchBookedHours).toHaveBeenCalledWith(date);
        expect(showToast).toHaveBeenCalledWith('Слоты уже изменились. Расписание обновлено.', 'error');
    });

    it('keeps the cancel selection when the server fails', async () => {
        vi.mocked(APICancelBooking).mockResolvedValue(jsonResponse(500, {
            error: 'Internal error',
        }));

        const { result } = renderBooking();
        await act(async () => {
            await result.current.handleCancel();
        });

        expect(setHoursToCancel).not.toHaveBeenCalled();
        expect(fetchBookedHours).toHaveBeenCalledWith(date);
        expect(showToast).toHaveBeenCalledWith('Не удалось отменить бронирование.', 'error');
    });
});
