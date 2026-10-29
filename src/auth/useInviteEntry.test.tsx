/**
 * @file Тихий startapp на /app вызывает registerWithInvite один раз для guest.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { IUser } from '@/types/user.types.ts';

const readTelegramStartParam = vi.fn();

vi.mock('@/telegram/useSafeLaunchParams.ts', () => ({
    readTelegramStartParam: (...args: unknown[]) => readTelegramStartParam(...args),
}));

vi.mock('@/api/user.api.ts', () => ({
    APIValidateInvite: vi.fn(),
}));

import { useTelegramStartInvite } from '@/auth/useInviteEntry.ts';

describe('useTelegramStartInvite', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        readTelegramStartParam.mockReturnValue('start-code');
    });

    it('applies invite once for authenticated guest', async () => {
        const registerWithInvite = vi.fn().mockResolvedValue(undefined);
        const showToast = vi.fn();
        const guest: IUser = {
            first_name: 'G',
            role: 'guest',
            isRegistered: true,
        };

        renderHook(() =>
            useTelegramStartInvite({
                isInTelegram: true,
                authLoading: false,
                isAuthenticated: true,
                user: guest,
                launchParams: { tgWebAppStartParam: 'start-code' },
                registerWithInvite,
                showToast,
            }),
        );

        await waitFor(() => {
            expect(registerWithInvite).toHaveBeenCalledWith('start-code');
        });
        expect(registerWithInvite).toHaveBeenCalledTimes(1);
        expect(showToast).toHaveBeenCalledWith(
            'Доступ по ссылке открыт. Можно бронировать.',
            'success',
        );
    });

    it('does not apply for authenticated user role', () => {
        const registerWithInvite = vi.fn().mockResolvedValue(undefined);
        const showToast = vi.fn();

        renderHook(() =>
            useTelegramStartInvite({
                isInTelegram: true,
                authLoading: false,
                isAuthenticated: true,
                user: { first_name: 'U', role: 'user' },
                launchParams: { tgWebAppStartParam: 'start-code' },
                registerWithInvite,
                showToast,
            }),
        );

        expect(registerWithInvite).not.toHaveBeenCalled();
    });
});
