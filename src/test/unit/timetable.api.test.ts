import { describe, expect, it } from 'vitest';
import { readBookFailure } from '@/api/timetable.api.ts';

/**
 * Ответ POST /api/book с JSON-телом.
 * @param status HTTP-статус
 * @param body Тело, как его отдаёт createBooking
 * @returns Response
 */
const bookResponse = (status: number, body: object) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
});

describe('readBookFailure', () => {
    it('maps a 409 to the conflicting hours', async () => {
        const failure = await readBookFailure(bookResponse(409, {
            error: 'Some hours are already booked.',
            conflictingHours: ['14:00'],
        }));

        expect(failure.message).toBe('Это время уже занято.');
        expect(failure.rejectedHours).toEqual(['14:00']);
    });

    it('maps past and off-grid hours from a 400', async () => {
        const past = await readBookFailure(bookResponse(400, {
            error: 'Cannot book past time slots.',
            pastHours: ['12:00'],
        }));
        expect(past.message).toBe('Нельзя бронировать прошедшее время.');
        expect(past.rejectedHours).toEqual(['12:00']);

        const invalid = await readBookFailure(bookResponse(400, {
            error: 'Hours outside studio schedule (12:00–23:00).',
            invalidHours: ['09:00'],
        }));
        expect(invalid.message).toBe('Эти часы вне расписания студии.');
        expect(invalid.rejectedHours).toEqual(['09:00']);
    });
});
