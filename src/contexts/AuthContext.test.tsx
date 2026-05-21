import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from './AuthContext.tsx';
import { useAuth } from '@/hooks/useAuth.ts';

vi.mock('@/telegram/env.ts', () => ({
    getTelegramEnvironment: () => false,
}));

vi.mock('@/telegram/useSafeLaunchParams.ts', () => ({
    useSafeLaunchParams: () => ({ launchParams: null, isTelegram: false }),
    useSafeRawInitData: () => null,
}));

vi.mock('@/auth/telegramAuth.ts', () => ({
    buildTelegramAuthPayload: vi.fn(),
}));

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

function Probe() {
    const { authStatus, authProvider, isLoading } = useAuth();
    return (
        <div>
            <span data-testid="status">{authStatus}</span>
            <span data-testid="provider">{authProvider ?? 'none'}</span>
            <span data-testid="loading">{String(isLoading)}</span>
        </div>
    );
}

describe('AuthContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('restores session from stored token', async () => {
        localStorage.setItem('authToken', 'stored-jwt');
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                valid: true,
                token: 'stored-jwt',
                authProvider: 'web',
                user: { _id: '1', first_name: 'A', role: 'user', isRegistered: true },
            }),
        });

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });
        expect(screen.getByTestId('status').textContent).toBe('authenticated');
        expect(screen.getByTestId('provider').textContent).toBe('web');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/auth/session'),
            expect.objectContaining({ method: 'GET' }),
        );
    });
});
