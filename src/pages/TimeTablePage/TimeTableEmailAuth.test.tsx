import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TimeTableEmailDialogs } from './TimeTableEmailAuth.tsx';
import { useTimeTableEmailAuth } from './useTimeTableEmailAuth.ts';

vi.mock('@/auth/useEmailAuth.ts', () => ({
    useEmailAuth: () => ({
        linkEmailPassword: vi.fn(),
        loginWithEmailPassword: vi.fn(),
        confirmEmailToken: vi.fn(),
        requestPasswordReset: vi.fn(),
        resetPasswordWithToken: vi.fn(),
    }),
}));

/**
 * Рисует почтовые окна внутри роутера с заданным query.
 * @param search Строка запроса
 * @param authLoading Сессия ещё читается
 * @returns Ничего
 */
const renderDialogs = (search: string, authLoading = false) => {
    const Probe = () => {
        const auth = useTimeTableEmailAuth({
            user: null,
            isAuthenticated: false,
            isGuest: false,
            isAdmin: false,
            isInTelegram: false,
            authLoading,
            showToast: vi.fn(),
        });
        return <TimeTableEmailDialogs auth={auth} />;
    };

    render(
        <MemoryRouter initialEntries={[`/${search}`]}>
            <Probe />
        </MemoryRouter>,
    );
};

describe('TimeTableEmailDialogs', () => {
    it('opens the reset form from a passwordReset link', async () => {
        renderDialogs('?passwordReset=token-1');
        expect(await screen.findByRole('heading', { name: 'Новый пароль' })).toBeInTheDocument();
    });

    it('waits for the session before opening a reset link', () => {
        renderDialogs('?passwordReset=token-1', true);
        expect(screen.queryByRole('heading', { name: 'Новый пароль' })).not.toBeInTheDocument();
    });
});
