/**
 * @file Конец записи: один audio, следующая цель статистики, кнопка громкости.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrackPlayer } from '@/components/TrackPlayer/TrackPlayer.tsx';
import { recordMusicEvent } from '@/music/listenStats.ts';

vi.mock('@/music/listenStats.ts', () => ({
    recordMusicEvent: vi.fn(),
}));

describe('TrackPlayer', () => {
    beforeEach(() => {
        vi.mocked(recordMusicEvent).mockClear();
        vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
        vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
        vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    });

    it('из ended меняет src того же audio и считает только новую запись', () => {
        const onAutoAdvance = vi.fn();
        render(
            <TrackPlayer
                title="Ночь"
                credits="Север"
                src="/api/music/tracks/a/audio?v=1"
                playRequest={0}
                autoAdvance
                hasNext
                hasPrevious={false}
                nextSrc="/api/music/tracks/b/audio?v=1"
                listen={{ trackId: 'a', albumId: 'alb' }}
                nextListen={{ trackId: 'b', albumId: 'alb' }}
                onAutoAdvance={onAutoAdvance}
                onPrevious={() => undefined}
                onNext={() => undefined}
            />,
        );
        const audio = document.querySelector('audio') as HTMLAudioElement;
        audio.dispatchEvent(new Event('play'));
        audio.dispatchEvent(new Event('ended'));
        expect(onAutoAdvance).toHaveBeenCalledTimes(1);
        expect(audio.src).toContain('/api/music/tracks/b/audio?v=1');
        expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
        audio.dispatchEvent(new Event('play'));
        expect(vi.mocked(recordMusicEvent).mock.calls.map((call) => `${call[0]}:${call[1].trackId}`)).toEqual([
            'play_start:a',
            'play_complete:a',
            'play_start:b',
        ]);
    });

    it('без следующей записи останавливается и не повторяет дослушивание', () => {
        const onAutoAdvance = vi.fn();
        render(
            <TrackPlayer
                title="День"
                credits="Север"
                src="/api/music/tracks/b/audio?v=1"
                playRequest={0}
                autoAdvance
                hasNext={false}
                nextSrc={null}
                listen={{ trackId: 'b', albumId: 'alb' }}
                onAutoAdvance={onAutoAdvance}
            />,
        );
        const audio = document.querySelector('audio') as HTMLAudioElement;
        Object.defineProperty(audio, 'duration', { configurable: true, get: () => 100 });
        Object.defineProperty(audio, 'currentTime', { configurable: true, get: () => 95 });
        audio.dispatchEvent(new Event('play'));
        audio.dispatchEvent(new Event('timeupdate'));
        audio.dispatchEvent(new Event('ended'));
        expect(onAutoAdvance).not.toHaveBeenCalled();
        expect(audio.getAttribute('src')).toContain('/api/music/tracks/b/audio');
        expect(vi.mocked(recordMusicEvent).mock.calls.map((call) => call[0])).toEqual([
            'play_start',
            'play_complete',
        ]);
    });

    it('кнопка звука глушит, ползунок подписан и не стоит отдельной строкой', async () => {
        const user = userEvent.setup();
        render(
            <TrackPlayer
                title="Ночь"
                credits="Север"
                src="/api/music/tracks/a/audio?v=1"
                playRequest={0}
            />,
        );
        const mute = screen.getByRole('button', { name: 'Выключить звук' });
        const slider = screen.getByRole('slider', { name: 'Громкость' });
        expect(mute.compareDocumentPosition(slider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        await user.click(mute);
        expect(screen.getByRole('button', { name: 'Включить звук' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('region', { name: 'Плеер' }).querySelector('[class*="volumeRow"]')).toBeNull();
    });
});
