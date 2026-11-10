/**
 * @file Тесты {@link AuthProvider}: восстановление сессии по сохранённому JWT
 * из localStorage через `GET /api/auth/session`. Сетевые вызовы мокаются через
 * `globalThis.fetch`, telegram-окружение принудительно отключается.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider } from '@/contexts/AuthContext.tsx';
import { useAuth } from '@/hooks/useAuth.ts';
import { useEmailAuth } from '@/auth/useEmailAuth.ts';

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
    const { authStatus, authProvider, isLoading, isInTelegram, telegramStartParam } = useAuth();
    return (
        <div>
            <span data-testid="status">{authStatus}</span>
            <span data-testid="provider">{authProvider ?? 'none'}</span>
            <span data-testid="loading">{String(isLoading)}</span>
            <span data-testid="in-telegram">{String(isInTelegram)}</span>
            <span data-testid="start-param">{telegramStartParam ?? 'none'}</span>
        </div>
    );
}

function EmailLoginProbe() {
    const { isAuthenticated } = useAuth();
    const { loginWithEmailPassword } = useEmailAuth();
    return (
        <div>
            <span data-testid="authed">{String(isAuthenticated)}</span>
            <button
                type="button"
                onClick={() => {
                    void loginWithEmailPassword('g@ex.com', 'password12').catch((err: Error) => {
                        const el = document.querySelector('[data-testid="err"]');
                        if (el) el.textContent = err.message;
                    });
                }}
            >
                login
            </button>
            <span data-testid="err" />
        </div>
    );
}

const liveJwt = () => {
    const exp = Math.floor(Date.now() / 1000) + 60 * 60;
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify({ exp, userId: '1' }));
    return `${header}.${body}.sig`;
};

describe('AuthContext', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('restores session from stored token', async () => {
        localStorage.setItem('authToken', liveJwt());
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
        expect(screen.getByTestId('in-telegram').textContent).toBe('false');
        expect(screen.getByTestId('start-param').textContent).toBe('none');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/auth/session'),
            expect.objectContaining({ method: 'GET' }),
        );
    });

    it('rejects email login without token (guest)', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                valid: true,
                token: null,
                authProvider: 'email',
                user: { _id: '2', first_name: 'G', role: 'guest' },
            }),
        });

        render(
            <AuthProvider>
                <EmailLoginProbe />
            </AuthProvider>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('authed').textContent).toBe('false');
        });

        await act(async () => {
            screen.getByRole('button', { name: 'login' }).click();
        });

        await waitFor(() => {
            expect(screen.getByTestId('err').textContent).toContain(
                'после одобрения',
            );
        });
        expect(screen.getByTestId('authed').textContent).toBe('false');
        expect(localStorage.getItem('authToken')).toBeNull();
    });

    it('не зовёт session и не шумит, если JWT уже просрочен', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const exp = Math.floor(Date.now() / 1000) - 120;
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const body = btoa(JSON.stringify({ exp, userId: '1' }));
        localStorage.setItem('authToken', `${header}.${body}.sig`);

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });
        expect(screen.getByTestId('status').textContent).toBe('anonymous');
        expect(mockFetch).not.toHaveBeenCalled();
        expect(localStorage.getItem('authToken')).toBeNull();
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('тихо принимает valid:false и не пишет ошибку в консоль', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.setItem('authToken', liveJwt());
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ valid: false }),
        });

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('loading').textContent).toBe('false');
        });
        expect(screen.getByTestId('status').textContent).toBe('anonymous');
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(localStorage.getItem('authToken')).toBeNull();
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('повторяет session один раз после сетевого сбоя и тогда входит', async () => {
        localStorage.setItem('authToken', liveJwt());
        mockFetch
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    valid: true,
                    token: 'fresh-jwt',
                    authProvider: 'web',
                    user: { _id: '1', first_name: 'A', role: 'admin', isRegistered: true },
                }),
            });

        render(
            <AuthProvider>
                <Probe />
            </AuthProvider>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('status').textContent).toBe('authenticated');
        });
        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem('authToken')).toBe('fresh-jwt');
    });
});
