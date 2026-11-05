import { describe, expect, it } from 'vitest';
import { studioTodayMoment } from '@/lib/studioToday.ts';

describe('studioTodayMoment', () => {
    it('opens the calendar on the Moscow day, not the UTC day', () => {
        // 22:30 UTC 5 ноября — уже 01:30 6 ноября в Москве
        const now = new Date('2026-11-05T22:30:00.000Z');
        expect(studioTodayMoment(now).format('DD/MM/YYYY')).toBe('06/11/2026');
    });
});
