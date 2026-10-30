import { describe, it, expect } from 'vitest';
import {
    formatDayBookings,
    formatFreeSlots,
    formatMyBookings,
} from '../../telegram/scheduleMessages.js';

describe('scheduleMessages', () => {
    it('formatDayBookings empty day', () => {
        const text = formatDayBookings('15/06/2030', [], 'Сегодня');
        expect(text).toContain('15/06/2030');
        expect(text).toContain('Свободно');
    });

    it('formatDayBookings lists a slot as occupied without the booker', () => {
        const text = formatDayBookings('15/06/2030', [
            { hour: '14:00', userId: 'u1', username: 'alice', band_name: 'Band' },
        ], 'Сегодня');
        expect(text).toContain('14:00 - 15:00 — занято');
        expect(text).not.toContain('alice');
        expect(text).not.toContain('Band');
    });

    it('formatDayBookings merges consecutive hours and hides who booked', () => {
        const text = formatDayBookings('15/06/2030', [
            { hour: '16:00', userId: 'u1', username: 'alice', band_name: 'Band' },
            { hour: '14:00', userId: 'u1', username: 'alice', band_name: 'Band' },
            { hour: '15:00', userId: 'u1', username: 'alice', band_name: 'Band' },
            { hour: '18:00', userId: 'u1', username: 'alice', band_name: 'Other' },
            { hour: '19:00', userId: 'u2', username: 'bob', band_name: 'Band' },
            { hour: '20:00', userId: 'u2', username: 'bob', band_name: 'Band' },
        ], 'Завтра');

        expect(text).toContain('14:00 - 17:00 — занято');
        expect(text).toContain('18:00 - 21:00 — занято');
        expect(text).not.toContain('alice');
        expect(text).not.toContain('bob');
        expect(text).not.toContain('Other');
    });

    it('formatFreeSlots excludes booked hours', () => {
        const text = formatFreeSlots('15/06/2030', [{ hour: '12:00' }]);
        expect(text).not.toMatch(/\b12:00\b/);
        expect(text).toContain('13:00');
    });

    it('formatMyBookings empty', () => {
        expect(formatMyBookings([], 'abc')).toContain('нет предстоящих');
    });

    it('formatMyBookings filters by userId', () => {
        const text = formatMyBookings([
            {
                date: '20/06/2030',
                hours: [
                    { hour: '15:00', userId: 'u1', band_name: '' },
                    { hour: '16:00', userId: 'u2', band_name: 'X' },
                ],
            },
        ], 'u1');
        expect(text).toContain('15:00');
        expect(text).not.toContain('16:00');
    });
});
