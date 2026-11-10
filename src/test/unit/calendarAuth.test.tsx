/**
 * @file Кто видит календарь в стелс-режиме.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { canSeeStudioCalendar } from '@/auth/calendarAuth.ts';
import { StudioClosedScreen } from '@/components/StudioClosedScreen/StudioClosedScreen.tsx';

describe('canSeeStudioCalendar', () => {
    it('hides the calendar from anyone without a users document while stealth is on', () => {
        expect(canSeeStudioCalendar(true, null)).toBe(false);
        expect(canSeeStudioCalendar(true, { _id: undefined })).toBe(false);
        expect(canSeeStudioCalendar(true, { _id: 'abc' })).toBe(true);
    });

    it('shows the calendar to everyone when stealth is off', () => {
        expect(canSeeStudioCalendar(false, null)).toBe(true);
    });
});

describe('StudioClosedScreen', () => {
    it('shows the invitation line and no slot hints', () => {
        render(<StudioClosedScreen />);

        expect(screen.getByRole('heading', { name: 'Запись по приглашению' })).toBeInTheDocument();
        expect(screen.getByText('Доступ открывает администратор студии.')).toBeInTheDocument();
        expect(screen.queryByText(/12:00|слот/i)).not.toBeInTheDocument();
    });
});
