/**
 * @file Unit-тесты видимости формы привязки почты.
 */
import { describe, expect, it } from 'vitest';
import { shouldShowEmailLinkForm } from './emailAuthUi.ts';

describe('shouldShowEmailLinkForm', () => {
    it('скрывает форму без сессии', () => {
        expect(
            shouldShowEmailLinkForm({
                isAuthenticated: false,
                isGuest: false,
                isAdmin: true,
                emailAuthUiEnabled: true,
            }),
        ).toBe(false);
    });

    it('скрывает форму у гостя', () => {
        expect(
            shouldShowEmailLinkForm({
                isAuthenticated: true,
                isGuest: true,
                isAdmin: false,
                emailAuthUiEnabled: true,
            }),
        ).toBe(false);
    });

    it('показывает форму админу без флага UI', () => {
        expect(
            shouldShowEmailLinkForm({
                isAuthenticated: true,
                isGuest: false,
                isAdmin: true,
                emailAuthUiEnabled: false,
            }),
        ).toBe(true);
    });

    it('показывает форму обычному user только с флагом', () => {
        expect(
            shouldShowEmailLinkForm({
                isAuthenticated: true,
                isGuest: false,
                isAdmin: false,
                emailAuthUiEnabled: false,
            }),
        ).toBe(false);

        expect(
            shouldShowEmailLinkForm({
                isAuthenticated: true,
                isGuest: false,
                isAdmin: false,
                emailAuthUiEnabled: true,
            }),
        ).toBe(true);
    });
});
