/**
 * @file STEALTH_MODE по умолчанию включён и выключается явными значениями.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { isStealthMode } from '../../config/stealthMode';

describe('isStealthMode', () => {
    const previous = process.env.STEALTH_MODE;

    afterEach(() => {
        if (previous === undefined) {
            delete process.env.STEALTH_MODE;
        } else {
            process.env.STEALTH_MODE = previous;
        }
    });

    it('is on when the variable is missing', () => {
        delete process.env.STEALTH_MODE;
        expect(isStealthMode()).toBe(true);
    });

    it('turns off only for 0, false, off and no', () => {
        for (const value of ['0', 'false', 'off', 'no', ' FALSE ']) {
            process.env.STEALTH_MODE = value;
            expect(isStealthMode()).toBe(false);
        }
        process.env.STEALTH_MODE = '1';
        expect(isStealthMode()).toBe(true);
    });
});
