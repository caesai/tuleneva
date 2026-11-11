/**
 * @file Публикация музыки спрятана от обычного админа.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminMusicPage } from '@/pages/AdminMusicPage/AdminMusicPage.tsx';
import {
    createMusicDraft,
    fetchManageCollections,
    fetchManageTracks,
    fetchMusicStats,
    setCollectionTracks,
} from '@/api/music.api.ts';
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
    fetchManageCollections: vi.fn().mockResolvedValue([]),
    fetchMusicStats: vi.fn().mockResolvedValue({
        days: 7,
        summary: { plays: 0, completes: 0, shares: 0, topSources: [], topTracks: [] },
        tracks: {},
        albums: {},
        playlists: {},
    }),
    createMusicDraft: vi.fn(),
    updateMusicTrack: vi.fn(),
    publishMusicTrack: vi.fn(),
    unpublishMusicTrack: vi.fn(),
    deleteMusicTrack: vi.fn(),
    createCollection: vi.fn(),
    updateCollection: vi.fn(),
    setCollectionTracks: vi.fn(),
    publishCollection: vi.fn(),
    unpublishCollection: vi.fn(),
    deleteCollection: vi.fn(),
    fetchTrackBlob: vi.fn(),
    trackAudioUrl: (id: string) => `/api/music/tracks/${id}/audio`,
    trackCoverUrl: (id: string) => `/api/music/tracks/${id}/cover`,
    collectionCoverUrl: (id: string) => `/api/music/collections/${id}/cover`,
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
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <AdminMusicPage />
            </MemoryRouter>,
        );
        await user.click(await screen.findByRole('button', { name: 'Новая запись' }));
        expect(screen.getByRole('button', { name: 'Сохранить черновик' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Опубликовать' })).not.toBeInTheDocument();
    });

    it('пустой список плейлистов открывает создание плейлиста', async () => {
        auth.isSuperAdmin = true;
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <AdminMusicPage />
            </MemoryRouter>,
        );
        await user.click(await screen.findByRole('tab', { name: 'Плейлисты' }));
        expect(await screen.findByText('Пока нет плейлистов.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Новый плейлист' }));
        expect(screen.getByRole('heading', { name: 'Новый плейлист' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Создать плейлист' })).toBeInTheDocument();
    });

    it('берёт из галереи любое фото и кладёт в форму уже сжатый JPEG', async () => {
        auth.isSuperAdmin = true;
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <AdminMusicPage />
            </MemoryRouter>,
        );
        await user.click(await screen.findByRole('button', { name: 'Новая запись' }));
        const input = await screen.findByLabelText('Обложка');
        expect(input).toHaveAttribute('accept', 'image/*,.heic,.heif');
        await user.upload(input, new File(['heic'], 'IMG_0001.HEIC', { type: '' }));
        expect(await screen.findByText('cover.jpg')).toBeInTheDocument();
        expect(prepareCoverFile).toHaveBeenCalled();
    });

    it('показывает действия записи значками и спрашивает перед удалением', async () => {
        auth.isSuperAdmin = true;
        vi.mocked(fetchManageTracks).mockResolvedValueOnce([
            {
                id: 't1',
                title: 'Ночь',
                credits: 'Север',
                description: null,
                hasCover: false,
                publishedAt: null,
                status: 'draft',
            },
        ]);
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <AdminMusicPage />
            </MemoryRouter>,
        );
        expect(await screen.findByRole('button', { name: 'Слушать Ночь' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Опубликовать «Ночь»' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Изменить «Ночь»' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Действия Ночь' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Удалить «Ночь»' }));
        expect(await screen.findByRole('heading', { name: 'Удалить «Ночь»?' })).toBeInTheDocument();
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
        await user.click(await screen.findByRole('button', { name: 'Новая запись' }));
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
        await user.click(await screen.findByRole('button', { name: 'Новая запись' }));
        await user.type(await screen.findByLabelText('Название'), 'Ночь');
        await user.type(screen.getByLabelText('Кто играет'), 'Север');
        await user.upload(
            screen.getByLabelText('Файл MP3'),
            new File([new Uint8Array([0x49, 0x44, 0x33])], 'night.mp3', { type: 'audio/mpeg' }),
        );
        await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Обложка больше 2 МБ');
    });

    it('поднимает запись в альбоме кнопкой', async () => {
        auth.isSuperAdmin = true;
        vi.mocked(fetchManageCollections).mockResolvedValueOnce([
            {
                id: 'c',
                type: 'album',
                title: 'Север',
                description: null,
                hasCover: false,
                trackCount: 2,
                publishedAt: null,
                status: 'draft',
                tracks: [
                    {
                        id: 'a',
                        title: 'Ночь',
                        credits: 'Студия',
                        description: null,
                        hasCover: false,
                        publishedAt: null,
                        status: 'published',
                    },
                    {
                        id: 'b',
                        title: 'День',
                        credits: 'Студия',
                        description: null,
                        hasCover: false,
                        publishedAt: null,
                        status: 'published',
                    },
                ],
            },
        ]);
        vi.mocked(setCollectionTracks).mockResolvedValue({
            id: 'c',
            type: 'album',
            title: 'Север',
            description: null,
            hasCover: false,
            trackCount: 2,
            publishedAt: null,
        });
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <AdminMusicPage />
            </MemoryRouter>,
        );
        expect(await screen.findByLabelText('Сводка за 7 дней')).toHaveTextContent('0 прослушиваний');
        await user.click(await screen.findByRole('tab', { name: 'Альбомы' }));
        await user.click(await screen.findByRole('button', { name: 'Состав: Север' }));
        await user.click(screen.getByRole('button', { name: 'Выше: День' }));
        expect(setCollectionTracks).toHaveBeenCalledWith('c', ['b', 'a']);
    });

    it('показывает сводку за 7 дней и счётчики в списках', async () => {
        auth.isSuperAdmin = true;
        vi.mocked(fetchManageTracks).mockResolvedValueOnce([
            {
                id: 't1',
                title: 'Ночь',
                credits: 'Север',
                description: null,
                hasCover: false,
                publishedAt: '2026-11-01T00:00:00.000Z',
                status: 'published',
                albumTitle: 'Север',
            },
        ]);
        vi.mocked(fetchManageCollections).mockResolvedValueOnce([
            {
                id: 'c',
                type: 'album',
                title: 'Север',
                description: null,
                hasCover: false,
                trackCount: 1,
                publishedAt: '2026-11-01T00:00:00.000Z',
                status: 'published',
            },
            {
                id: 'p',
                type: 'playlist',
                title: 'Вечер',
                description: null,
                hasCover: false,
                trackCount: 1,
                publishedAt: '2026-11-01T00:00:00.000Z',
                status: 'published',
            },
        ]);
        vi.mocked(fetchMusicStats).mockResolvedValueOnce({
            days: 7,
            summary: {
                plays: 12,
                completes: 4,
                shares: 3,
                topSources: [{ source: 'instagram', count: 8 }, { source: '', count: 2 }],
                topTracks: [{ trackId: 't1', title: 'Ночь', plays: 6 }],
            },
            tracks: {
                t1: { plays7d: 6, playsAll: 10, completes7d: 2, completesAll: 4 },
            },
            albums: {
                c: { plays7d: 5, playsAll: 9, completes7d: 1, completesAll: 3 },
            },
            playlists: {
                p: { plays7d: 1, playsAll: 1, completes7d: 0, completesAll: 0 },
            },
        });
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <AdminMusicPage />
            </MemoryRouter>,
        );
        const summary = await screen.findByLabelText('Сводка за 7 дней');
        expect(summary).toHaveTextContent('12 прослушиваний');
        expect(summary).toHaveTextContent('до конца 4');
        expect(summary).toHaveTextContent('поделились 3');
        expect(summary).toHaveTextContent('instagram 8');
        expect(summary).toHaveTextContent('без метки 2');
        expect(summary).toHaveTextContent('Ночь 6');
        expect(screen.getByText('7 дней: 6 прослуш., 2 до конца. Всего: 10 прослуш., 4 до конца')).toBeInTheDocument();

        await user.click(screen.getByRole('tab', { name: 'Альбомы' }));
        expect(screen.getByText('7 дней: 5 прослуш., 1 до конца. Всего: 9 прослуш., 3 до конца')).toBeInTheDocument();

        await user.click(screen.getByRole('tab', { name: 'Плейлисты' }));
        expect(screen.getByText('7 дней: 1 прослуш., 0 до конца. Всего: 1 прослуш., 0 до конца')).toBeInTheDocument();
    });
});
