/**
 * @file Каталог — сетка обложек. Плеер на подборке идёт по её порядку и сам не стартует.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { usePageMeta } from '@/hooks/usePageMeta.ts';
import { MusicCollectionPage } from '@/pages/MusicPage/MusicCollectionPage.tsx';
import { MusicPage } from '@/pages/MusicPage/MusicPage.tsx';
import { fetchCollection, fetchMusicCatalog, fetchPublishedTrack } from '@/api/music.api.ts';

vi.mock('@/hooks/usePageMeta.ts', () => ({
    usePageMeta: vi.fn(),
}));

vi.mock('@/api/music.api.ts', () => ({
    fetchMusicCatalog: vi.fn(),
    fetchPublishedTrack: vi.fn(),
    fetchCollection: vi.fn(),
    trackAudioUrl: (id: string) => `/api/music/tracks/${id}/audio`,
    trackCoverUrl: (id: string) => `/api/music/tracks/${id}/cover`,
    collectionCoverUrl: (id: string) => `/api/music/collections/${id}/cover`,
}));

const renderMusic = (path = '/music') => render(
    <MemoryRouter initialEntries={[path]}>
        <Routes>
            <Route path="/music" element={<MusicPage />} />
            <Route path="/music/album/:id" element={<MusicCollectionPage />} />
            <Route path="/music/playlist/:id" element={<MusicCollectionPage />} />
            <Route path="/music/:trackId" element={<MusicPage />} />
        </Routes>
    </MemoryRouter>,
);

const track = (
    id: string,
    title: string,
    extra: { albumId?: string | null; description?: string | null } = {},
) => ({
    id,
    title,
    credits: 'Студия',
    description: extra.description ?? null,
    hasCover: false,
    publishedAt: '2026-11-01T00:00:00.000Z',
    albumId: extra.albumId ?? null,
});

describe('MusicPage', () => {
    const play = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
        play.mockClear();
        vi.mocked(usePageMeta).mockClear();
        vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(play);
        vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
        vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    });

    it('показывает пустой каталог без прежнего вступления', async () => {
        vi.mocked(fetchMusicCatalog).mockResolvedValue({ collections: [], singles: [] });
        renderMusic();
        expect(await screen.findByText(/Пока здесь тихо/)).toBeInTheDocument();
        expect(screen.queryByText(/Слушать можно без входа/)).not.toBeInTheDocument();
        expect(play).not.toHaveBeenCalled();
        expect(screen.queryByRole('link', { name: 'Расписание' })).not.toBeInTheDocument();
    });

    it('даёт повторить загрузку после ошибки', async () => {
        vi.mocked(fetchMusicCatalog)
            .mockRejectedValueOnce(new Error('Сеть недоступна'))
            .mockResolvedValueOnce({ collections: [], singles: [] });
        const user = userEvent.setup();
        renderMusic();
        expect(await screen.findByRole('alert')).toHaveTextContent('Сеть недоступна');
        await user.click(screen.getByRole('button', { name: 'Повторить' }));
        expect(await screen.findByText(/Пока здесь тихо/)).toBeInTheDocument();
    });

    it('показывает обложки альбомов и синглы без подборки', async () => {
        vi.mocked(fetchMusicCatalog).mockResolvedValue({
            collections: [
                {
                    id: 'alb',
                    type: 'album',
                    title: 'Север',
                    description: null,
                    hasCover: false,
                    trackCount: 2,
                    publishedAt: '2026-11-01T00:00:00.000Z',
                },
            ],
            singles: [track('solo', 'Одна')],
        });
        renderMusic();
        const album = await screen.findByRole('link', { name: /Север/ });
        expect(album).toHaveAttribute('href', '/music/album/alb');
        expect(album).toHaveTextContent('Альбом');
        expect(album).toHaveTextContent('2 записи');
        expect(screen.getByRole('heading', { name: 'Синглы' })).toBeInTheDocument();
        expect(screen.getAllByRole('heading', { name: 'Музыка' })).toHaveLength(1);
        expect(screen.queryByText('Тюленева 25')).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
        expect(screen.getByRole('link', { name: 'Ссылка на «Одна»' })).toHaveAttribute('href', '/music/solo');
        expect(screen.queryByText('Студия')).not.toBeInTheDocument();
        expect(play).not.toHaveBeenCalled();
    });

    it('открывает старую ссылку на запись и не играет сам', async () => {
        vi.mocked(fetchPublishedTrack).mockResolvedValue(track('a', 'Ночь', { description: 'Тихий дубль' }));
        const user = userEvent.setup();
        renderMusic('/music/a');
        expect(await screen.findByRole('button', { name: 'Слушать: Ночь' })).toBeInTheDocument();
        expect(play).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Слушать: Ночь' }));
        expect(play).toHaveBeenCalled();
        expect(document.querySelector('audio')?.getAttribute('src')).toContain('/api/music/tracks/a/audio');
        expect(vi.mocked(usePageMeta)).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Ночь — Тюленева 25',
            canonicalPath: '/music/a',
            ogType: 'music.song',
        }));
    });

    it('на альбоме переключает previous и next по порядку подборки', async () => {
        vi.mocked(fetchCollection).mockResolvedValue({
            id: 'alb',
            type: 'album',
            title: 'Север',
            description: 'Холод',
            hasCover: true,
            trackCount: 2,
            publishedAt: '2026-11-01T00:00:00.000Z',
            tracks: [track('a', 'Ночь'), track('b', 'День')],
        });
        const user = userEvent.setup();
        renderMusic('/music/album/alb');
        expect(await screen.findByRole('heading', { name: 'Север' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Музыка' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Вся музыка' })).toHaveAttribute('href', '/music');
        expect(screen.getByRole('button', { name: 'Поделиться' })).toBeInTheDocument();
        expect(screen.queryByText('Студия')).not.toBeInTheDocument();
        expect(document.querySelectorAll('img[src="/api/music/collections/alb/cover"]').length).toBeGreaterThan(1);
        expect(screen.getByText('Альбом')).toBeInTheDocument();
        expect(play).not.toHaveBeenCalled();
        expect(screen.getByRole('img', { name: 'Обложка «Север»' })).toHaveAttribute(
            'src',
            '/api/music/collections/alb/cover',
        );

        await user.click(screen.getByRole('button', { name: 'Слушать: Ночь' }));
        const audio = document.querySelector('audio');
        expect(audio?.getAttribute('src')).toContain('/api/music/tracks/a/audio');
        expect(screen.getByRole('button', { name: 'Предыдущая запись' })).toBeDisabled();

        await user.click(screen.getByRole('button', { name: 'Следующая запись' }));
        expect(audio?.getAttribute('src')).toContain('/api/music/tracks/b/audio');
        expect(screen.getByRole('button', { name: 'Предыдущая запись' })).toBeEnabled();

        await user.click(screen.getByRole('button', { name: 'Предыдущая запись' }));
        expect(audio?.getAttribute('src')).toContain('/api/music/tracks/a/audio');
        expect(vi.mocked(usePageMeta)).toHaveBeenCalledWith(expect.objectContaining({
            title: 'Север — Тюленева 25',
            canonicalPath: '/music/album/alb',
            ogType: 'music.album',
            ogImagePath: '/api/music/collections/alb/cover',
        }));
    });

    it('копирует ссылку альбома, если нет системного «Поделиться»', async () => {
        vi.mocked(fetchCollection).mockResolvedValue({
            id: 'alb',
            type: 'album',
            title: 'Север',
            description: null,
            hasCover: false,
            trackCount: 1,
            publishedAt: '2026-11-01T00:00:00.000Z',
            tracks: [track('a', 'Ночь')],
        });
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: undefined,
        });
        const user = userEvent.setup();
        renderMusic('/music/album/alb');
        await user.click(await screen.findByRole('button', { name: 'Поделиться' }));
        expect(await screen.findByText('Ссылка скопирована')).toBeInTheDocument();
        expect(await navigator.clipboard.readText()).toBe('https://tuleneva25.ru/music/album/alb');
    });

    it('на плейлисте делится адресом плейлиста через Web Share', async () => {
        vi.mocked(fetchCollection).mockResolvedValue({
            id: 'pl',
            type: 'playlist',
            title: 'Вечер',
            description: null,
            hasCover: false,
            trackCount: 1,
            publishedAt: '2026-11-01T00:00:00.000Z',
            tracks: [track('a', 'Ночь')],
        });
        const share = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'share', {
            configurable: true,
            value: share,
        });
        const user = userEvent.setup();
        renderMusic('/music/playlist/pl');
        expect(await screen.findByText('Плейлист')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Поделиться' }));
        expect(share).toHaveBeenCalledWith({
            title: 'Вечер — Тюленева 25',
            url: 'https://tuleneva25.ru/music/playlist/pl',
        });
    });
});
