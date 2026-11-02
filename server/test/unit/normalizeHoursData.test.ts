import { describe, it, expect } from 'vitest';
import { normalizeHoursData } from '../../booking/createBooking';

/**
 * Unit: legacy object → bookedHourSchema.
 */
describe('normalizeHoursData', () => {
    it('converts legacy BOOKED object keys to array slots', () => {
        const legacy = {
            '14:00': {
                status: 'BOOKED',
                owner: 'legacy_user',
                userId: 'u-legacy',
                bandName: 'Legacy Band',
                avatar: 'https://example.com/a.jpg',
            },
            '15:00': {
                status: 'FREE',
            },
            _id: 'ignore-me',
        };

        const hours = normalizeHoursData(legacy);
        expect(hours).toEqual([
            {
                hour: '14:00',
                userId: 'u-legacy',
                username: 'legacy_user',
                band_name: 'Legacy Band',
                userPhotoUrl: 'https://example.com/a.jpg',
            },
        ]);
    });

    it('copies rehearsalType from a legacy booked slot', () => {
        const hours = normalizeHoursData({
            '12:00': {
                status: 'BOOKED',
                owner: 'a',
                userId: 'u',
                rehearsalType: 'recording',
            },
        });
        expect(hours).toEqual([
            {
                hour: '12:00',
                userId: 'u',
                username: 'a',
                band_name: '',
                userPhotoUrl: null,
                rehearsalType: 'recording',
            },
        ]);
    });

    it('passes through new-format array', () => {
        const modern = [
            {
                hour: '12:00',
                userId: 'u1',
                username: 'a',
                band_name: '',
                rehearsalType: 'rehearsal',
            },
        ];
        expect(normalizeHoursData(modern)).toBe(modern);
    });

    it('returns empty array for nullish', () => {
        expect(normalizeHoursData(null)).toEqual([]);
        expect(normalizeHoursData(undefined)).toEqual([]);
    });
});
