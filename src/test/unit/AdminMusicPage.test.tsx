/**
 * @file Публикация музыки спрятана от обычного админа.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminMusicPage } from '@/pages/AdminMusicPage/AdminMusicPage.tsx';

const auth = vi.hoisted(() => ({
    isSuperAdmin: false,
    isLoading: false,
}));

vi.mock('@/hooks/useAuth.ts', () => ({
    useAuth: () => ({
        capabilities: {
            isSuperAdmin: auth.isSuperAdmin,
            isAdmin: true,
            isGuest: false,
            canManageBookings: true,
            canViewUserDetails: true,
        },
        isLoading: auth.isLoading,
    }),
}));

vi.mock('@/api/music.api.ts', () => ({
    fetchManageTracks: vi.fn().mockResolvedValue([]),
    createMusicDraft: vi.fn(),
    updateMusicTrack: vi.fn(),
    publishMusicTrack: vi.fn(),
    unpublishMusicTrack: vi.fn(),
    deleteMusicTrack: vi.fn(),
    fetchTrackBlob: vi.fn(),
    trackAudioUrl: (id: string) => `/api/music/tracks/${id}/audio`,
    trackCoverUrl: (id: string) => `/api/music/tracks/${id}/cover`,
}));

describe('AdminMusicPage', () => {
    it('обычному админу не показывает форму', () => {
        auth.isSuperAdmin = false;
        render(
            <MemoryRouter>
                <AdminMusicPage />
            </MemoryRouter>,
        );
        expect(screen.getByText(/только супер-админ/)).toBeInTheDocument();
        expect(screen.queryByLabelText('Файл MP3')).not.toBeInTheDocument();
    });

    it('супер-админ сохраняет черновик отдельной кнопкой, не публикацией', async () => {
        auth.isSuperAdmin = true;
        render(
            <MemoryRouter>
                <AdminMusicPage />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('button', { name: 'Сохранить черновик' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Опубликовать' })).not.toBeInTheDocument();
    });
});
