/**
 * @file Плеер не стартует сам и играет одну запись.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MusicPage } from '@/pages/MusicPage/MusicPage.tsx';
import { fetchPublishedTracks } from '@/api/music.api.ts';

vi.mock('@/hooks/usePageMeta.ts', () => ({
    usePageMeta: vi.fn(),
}));

vi.mock('@/api/music.api.ts', () => ({
    fetchPublishedTracks: vi.fn(),
    trackAudioUrl: (id: string) => `/api/music/tracks/${id}/audio`,
    trackCoverUrl: (id: string) => `/api/music/tracks/${id}/cover`,
}));

const renderPage = (path = '/music') => render(
    <MemoryRouter initialEntries={[path]}>
        <Routes>
            <Route path="/music/:trackId?" element={<MusicPage />} />
        </Routes>
    </MemoryRouter>,
);

describe('MusicPage', () => {
    const play = vi.fn().mockResolvedValue(undefined);

    beforeEach(() => {
        play.mockClear();
        vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(play);
        vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
        vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    });

    it('показывает пустой каталог', async () => {
        vi.mocked(fetchPublishedTracks).mockResolvedValue([]);
        renderPage();
        expect(await screen.findByText(/Пока здесь тихо/)).toBeInTheDocument();
        expect(play).not.toHaveBeenCalled();
        expect(screen.queryByRole('link', { name: 'Расписание' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /открыть приложение/i })).not.toBeInTheDocument();
    });

    it('даёт повторить загрузку после ошибки', async () => {
        vi.mocked(fetchPublishedTracks)
            .mockRejectedValueOnce(new Error('Сеть недоступна'))
            .mockResolvedValueOnce([]);
        const user = userEvent.setup();
        renderPage();
        expect(await screen.findByRole('alert')).toHaveTextContent('Сеть недоступна');
        await user.click(screen.getByRole('button', { name: 'Повторить' }));
        expect(await screen.findByText(/Пока здесь тихо/)).toBeInTheDocument();
    });

    it('не играет само и переключает одну запись', async () => {
        vi.mocked(fetchPublishedTracks).mockResolvedValue([
            {
                id: 'a',
                title: 'Ночь',
                credits: 'Север',
                description: 'Тихий дубль',
                hasCover: false,
                publishedAt: '2026-11-01T00:00:00.000Z',
            },
            {
                id: 'b',
                title: 'День',
                credits: 'Юг',
                description: null,
                hasCover: false,
                publishedAt: '2026-11-02T00:00:00.000Z',
            },
        ]);
        const user = userEvent.setup();
        renderPage();
        expect(await screen.findByText('Ночь')).toBeInTheDocument();
        expect(play).not.toHaveBeenCalled();
        const shareLinks = screen.getAllByRole('link', { name: 'Ссылка' });
        expect(shareLinks[0]).toHaveAttribute('href', '/music/a');
        expect(shareLinks[1]).toHaveAttribute('href', '/music/b');

        await user.click(screen.getByRole('button', { name: 'Слушать: Ночь' }));
        expect(play).toHaveBeenCalled();
        const audio = document.querySelector('audio');
        expect(audio?.getAttribute('src')).toContain('/api/music/tracks/a/audio');

        await user.click(screen.getByRole('button', { name: 'Слушать: День' }));
        expect(audio?.getAttribute('src')).toContain('/api/music/tracks/b/audio');
        expect(screen.getByLabelText('Позиция воспроизведения')).toBeInTheDocument();
    });

    it('не считает обрыв play ошибкой и показывает настоящий отказ', async () => {
        vi.mocked(fetchPublishedTracks).mockResolvedValue([
            {
                id: 'a',
                title: 'Ночь',
                credits: 'Север',
                description: null,
                hasCover: false,
                publishedAt: '2026-11-01T00:00:00.000Z',
            },
        ]);
        const user = userEvent.setup();
        play.mockRejectedValueOnce(new DOMException('interrupted', 'AbortError'));
        renderPage();
        const clickListen = async () => {
            const buttons = await screen.findAllByRole('button', { name: 'Слушать: Ночь' });
            await user.click(buttons[0]);
        };
        await clickListen();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
        await clickListen();
        expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось воспроизвести запись.');
    });
});
