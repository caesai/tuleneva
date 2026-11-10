/**
 * @file Публикация музыки спрятана от обычного админа.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminMusicPage } from '@/pages/AdminMusicPage/AdminMusicPage.tsx';
import { createMusicDraft } from '@/api/music.api.ts';
import { prepareCoverFile } from '@/music/prepareCover.ts';

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
        authStatus: auth.isLoading ? 'loading' : 'authenticated',
    }),
}));

vi.mock('@/music/prepareCover.ts', () => ({
    prepareCoverFile: vi.fn(async (file: File) => new File([file], 'cover.jpg', { type: 'image/jpeg' })),
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

    it('берёт из галереи любое фото и кладёт в форму уже сжатый JPEG', async () => {
        auth.isSuperAdmin = true;
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <AdminMusicPage />
            </MemoryRouter>,
        );
        const input = await screen.findByLabelText('Обложка');
        expect(input).toHaveAttribute('accept', 'image/*,.heic,.heif');
        await user.upload(input, new File(['heic'], 'IMG_0001.HEIC', { type: '' }));
        expect(await screen.findByText('cover.jpg')).toBeInTheDocument();
        expect(prepareCoverFile).toHaveBeenCalled();
    });

    it('показывает русскую ошибку, если фото не открылось', async () => {
        auth.isSuperAdmin = true;
        vi.mocked(prepareCoverFile).mockRejectedValueOnce(
            new Error('Это фото не открылось. Выберите снимок из галереи ещё раз — страница сожмёт его сама.'),
        );
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <AdminMusicPage />
            </MemoryRouter>,
        );
        await user.upload(
            await screen.findByLabelText('Обложка'),
            new File(['heic'], 'IMG.HEIC', { type: 'image/heic' }),
        );
        expect(await screen.findByRole('alert')).toHaveTextContent('Это фото не открылось');
    });

    it('показывает отказ сервера по обложке', async () => {
        auth.isSuperAdmin = true;
        vi.mocked(createMusicDraft).mockRejectedValueOnce(
            new Error('Обложка больше 2 МБ. Выберите фото ещё раз — страница сожмёт его, если браузер его откроет.'),
        );
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <AdminMusicPage />
            </MemoryRouter>,
        );
        await user.type(await screen.findByLabelText('Название'), 'Ночь');
        await user.type(screen.getByLabelText('Кто играет'), 'Север');
        await user.upload(
            screen.getByLabelText('Файл MP3'),
            new File([new Uint8Array([0x49, 0x44, 0x33])], 'night.mp3', { type: 'audio/mpeg' }),
        );
        await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Обложка больше 2 МБ');
    });
});
