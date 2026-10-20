import { describe, it, expect } from 'vitest';
import {
    AVAILABLE_HOURS,
    isHourAllowed,
    isSlotInPast,
    addMoscowDaysDdMmYyyy,
} from '../../../shared/studioHours.cjs';

describe('studioHours', () => {
    it('lists twelve afternoon/evening slots', () => {
        expect(AVAILABLE_HOURS).toHaveLength(12);
        expect(AVAILABLE_HOURS[0]).toBe('12:00');
        expect(AVAILABLE_HOURS[11]).toBe('23:00');
    });

    it('isHourAllowed accepts grid hours only', () => {
        expect(isHourAllowed('14:00')).toBe(true);
        expect(isHourAllowed('09:00')).toBe(false);
    });

    it('isSlotInPast for a past calendar day', () => {
        expect(isSlotInPast('01/01/2020', '14:00', new Date('2030-06-15T12:00:00Z'))).toBe(true);
    });

    it('isSlotInPast for a future calendar day', () => {
        expect(isSlotInPast('01/01/2035', '14:00', new Date('2030-06-15T12:00:00Z'))).toBe(false);
    });

    it('addMoscowDaysDdMmYyyy shifts by one day', () => {
        // 2026-06-15 12:00 UTC ≈ 15:00 Moscow → base day 15/06/2026
        const now = new Date('2026-06-15T12:00:00.000Z');
        const today = addMoscowDaysDdMmYyyy(0, now);
        const tomorrow = addMoscowDaysDdMmYyyy(1, now);
        expect(today).toMatch(/^\d{2}\/\d{2}\/2026$/);
        expect(tomorrow).not.toBe(today);
    });
});
