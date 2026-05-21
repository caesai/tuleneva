import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from './AdminPage.tsx';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/hooks/useAuth.ts', () => ({
    useAuth: () => ({
        user: {
            _id: 'admin-1',
            first_name: 'Admin',
            role: 'admin',
        },
    }),
}));

vi.mock('@/api/user.api.ts', () => ({
    APIGetUsers: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
            { _id: 'g1', first_name: 'Guest', role: 'guest' },
            { _id: 'sa1', first_name: 'Super', role: 'super_admin' },
        ],
    }),
    APIUpdateUserRole: vi.fn(),
    APIDeleteUser: vi.fn(),
    APIGenerateInvite: vi.fn().mockImplementation(async (body: { allowedProviders: string[] }) => ({
        ok: true,
        json: async () => ({
            inviteLink: 'https://t.me/bot?startapp=abc',
            telegramInviteLink: 'https://t.me/bot?startapp=abc',
            webInviteLink: 'https://test.example/?invite=abc',
            allowedProviders: body.allowedProviders,
        }),
    })),
}));

describe('AdminPage', () => {
    beforeEach(() => {
        mockNavigate.mockClear();
    });

    it('admin role select does not offer super_admin for guest', async () => {
        render(
            <MemoryRouter>
                <AdminPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Guest')).toBeInTheDocument();
        const row = screen.getByText('Guest').closest('tr');
        expect(row).toBeTruthy();
        const select = within(row!).getByRole('combobox');
        const options = within(select).getAllByRole('option').map((o) => o.textContent);
        expect(options).not.toContain('Супер администратор');
    });

    it('shows web invite link only when web is in allowedProviders', async () => {
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <AdminPage />
            </MemoryRouter>,
        );

        expect(await screen.findByText('Управление пользователями')).toBeInTheDocument();
        await user.click(screen.getByText('Пригласить пользователя'));
        await user.click(screen.getByRole('checkbox', { name: /Telegram Mini App/i }));
        await user.click(await screen.findByText('Сгенерировать ссылку'));

        expect(screen.getByDisplayValue('https://test.example/?invite=abc')).toBeInTheDocument();
        expect(screen.queryByDisplayValue('https://t.me/bot?startapp=abc')).not.toBeInTheDocument();
    });
});
