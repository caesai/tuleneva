import { describe, it, expect } from 'vitest';
import {
    canViewBookingUserDetails,
    sanitizeHoursForViewer,
} from '../../auth/hourPrivacy.js';

describe('hourPrivacy', () => {
    const sampleHours = [{
        hour: '14:00',
        userId: 'uid1',
        username: 'alice',
        band_name: 'Band X',
        userPhotoUrl: 'https://example.com/a.jpg',
        rehearsalType: 'recording',
    }];

    it('canViewBookingUserDetails returns false without user', () => {
        expect(canViewBookingUserDetails(null)).toBe(false);
        expect(canViewBookingUserDetails(undefined)).toBe(false);
    });

    it('canViewBookingUserDetails returns false for guest', () => {
        expect(canViewBookingUserDetails({ role: 'guest' })).toBe(false);
    });

    it('canViewBookingUserDetails returns true for member roles', () => {
        expect(canViewBookingUserDetails({ role: 'user' })).toBe(true);
        expect(canViewBookingUserDetails({ role: 'admin' })).toBe(true);
    });

    it('sanitizeHoursForViewer strips PII for public viewers', () => {
        const result = sanitizeHoursForViewer(sampleHours, false);
        expect(result).toEqual([{ hour: '14:00', rehearsalType: 'recording' }]);
    });

    it('sanitizeHoursForViewer keeps full payload for authorized viewers', () => {
        expect(sanitizeHoursForViewer(sampleHours, true)).toEqual(sampleHours);
    });
});
