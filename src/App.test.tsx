import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

vi.mock('@telegram-apps/sdk-react', () => ({
    swipeBehavior: {
        mount: {
            isAvailable: () => false,
            isMounted: () => false,
        },
        disable: vi.fn(),
    },
}));

vi.mock('@telegram-apps/telegram-ui', () => ({
    AppRoot: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/telegram/env.ts', () => ({
    getTelegramEnvironment: () => false,
}));

vi.mock('@/telegram/useSafeLaunchParams.ts', () => ({
    useSafeLaunchParams: () => ({
        launchParams: { tgWebAppPlatform: 'web' },
        isTelegram: false,
    }),
    useSafeRawInitData: () => null,
}));

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
    return {
        ...actual,
        BrowserRouter: ({ children }: { children: ReactNode }) => (
            <MemoryRouter initialEntries={['/?invite=test-code']}>{children}</MemoryRouter>
        ),
    };
});

const registerWithInvite = vi.fn().mockResolvedValue(undefined);

vi.mock('@/hooks/useAuth.ts', () => ({
    useAuth: () => ({
        user: null,
        isLoading: false,
        isAuthenticated: false,
        register: vi.fn(),
        registerWithInvite,
    }),
}));

vi.mock('@/contexts/NetworkContext.tsx', () => ({
    NetworkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/pages/TimeTablePage/TimeTablePage.tsx', () => ({
    TimeTablePage: () => <div>TimeTable</div>,
}));

vi.mock('@/api/user.api.ts', () => ({
    APIValidateInvite: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
            valid: true,
            allowedProviders: ['web'],
        }),
    }),
}));

vi.mock('@/hooks/useToast.ts', () => ({
    useToast: () => ({
        toasts: [],
        showToast: vi.fn(),
        removeToast: vi.fn(),
    }),
}));

import App from './App.tsx';

describe('App invite flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('shows web invite form and submits with provider web', async () => {
        const user = userEvent.setup();
        render(<App />);

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/имя/i)).toBeInTheDocument();
        });

        await user.type(screen.getByPlaceholderText(/имя/i), 'Alice');
        const submit = screen.getByRole('button', { name: /запросить доступ|отправить|подтвердить/i });
        await user.click(submit);

        await waitFor(() => {
            expect(registerWithInvite).toHaveBeenCalledWith(
                'test-code',
                expect.objectContaining({ firstName: 'Alice' }),
            );
        });
    });
});
