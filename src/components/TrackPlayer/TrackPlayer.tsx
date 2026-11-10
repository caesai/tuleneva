/**
 * @file Один плеер: play/pause, соседние записи, перемотка и громкость. Без autoplay.
 */
import React, { useEffect, useRef, useState } from 'react';
import { MusicNoteIcon } from '@/components/Icons/Icons.tsx';
import {
    NextIcon,
    PauseIcon,
    PlayIcon,
    PreviousIcon,
    VolumeIcon,
    VolumeOffIcon,
} from '@/components/TrackPlayer/PlayerIcons.tsx';
import { isPlaceholderCredit } from '@/pages/MusicPage/credits.ts';
import css from './TrackPlayer.module.css';

interface TrackPlayerProps {
    /** Название. */
    title: string;
    /** Кто играет. */
    credits: string;
    /** Короткий текст или null. */
    description?: string | null;
    /** Обложка или null. */
    coverUrl?: string | null;
    /** Адрес аудио. null — плеер ждёт файл. */
    src: string | null;
    /** Счётчик жеста «слушать». 0 не запускает воспроизведение. */
    playRequest: number;
    /** Счётчик паузы из списка. 0 ничего не делает. */
    pauseRequest?: number;
    /** Есть предыдущая запись в каталоге. */
    hasPrevious?: boolean;
    /** Есть следующая запись в каталоге. */
    hasNext?: boolean;
    /** Сообщает, идёт ли сейчас звук. */
    onPlayingChange?: (playing: boolean) => void;
    /** Предыдущая запись. */
    onPrevious?: () => void;
    /** Следующая запись. */
    onNext?: () => void;
}

/**
 * Обрыв play() из-за нового src или StrictMode — не ошибка для слушателя.
 * @param err Причина отказа play()
 * @returns true, если воспроизведение просто прервали
 */
const isPlayAbort = (err: unknown): boolean => (
    typeof err === 'object'
    && err !== null
    && 'name' in err
    && err.name === 'AbortError'
);

/**
 * Форматирует секунды как m:ss.
 * @param seconds Секунды
 * @returns Строка времени
 */
const formatTime = (seconds: number): string => {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }
    const whole = Math.floor(seconds);
    const minutes = Math.floor(whole / 60);
    return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
};

/**
 * Плеер одной записи. Родитель не монтирует второй экземпляр.
 * @param props Метаданные, src и жест запуска
 * @returns Панель управления
 */
export const TrackPlayer: React.FC<TrackPlayerProps> = ({
    title,
    credits,
    description,
    coverUrl,
    src,
    playRequest,
    pauseRequest = 0,
    hasPrevious = false,
    hasNext = false,
    onPlayingChange,
    onPrevious,
    onNext,
}) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);
    const [mediaError, setMediaError] = useState(false);
    const [coverFailed, setCoverFailed] = useState(false);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        audio.pause();
        setPlaying(false);
        setCurrent(0);
        setDuration(0);
        setMediaError(false);
        if (!src) {
            audio.removeAttribute('src');
            return;
        }
        audio.src = src;
        audio.load();
    }, [src]);

    useEffect(() => {
        if (playRequest === 0) {
            return;
        }
        const audio = audioRef.current;
        if (!audio || !src) {
            return;
        }
        // Жест уже случился: play() сразу, не дожидаясь метаданных.
        // Иначе браузер теряет user activation и перемотка не стартует.
        audio.play()
            .then(() => {
                setPlaying(true);
                setMediaError(false);
            })
            .catch((err: unknown) => {
                if (!isPlayAbort(err)) {
                    setMediaError(true);
                }
            });
    }, [playRequest, src]);

    useEffect(() => () => {
        audioRef.current?.pause();
    }, []);

    useEffect(() => {
        if (pauseRequest === 0) {
            return;
        }
        audioRef.current?.pause();
        setPlaying(false);
    }, [pauseRequest]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        audio.volume = muted ? 0 : volume;
    }, [muted, volume, src]);

    useEffect(() => {
        onPlayingChange?.(playing);
    }, [onPlayingChange, playing]);

    /**
     * Сдвигает позицию на delta секунд.
     * @param delta Секунды, отрицательные — назад
     */
    const seekBy = (delta: number) => {
        const audio = audioRef.current;
        if (!audio || !duration) {
            return;
        }
        const next = Math.min(duration, Math.max(0, audio.currentTime + delta));
        audio.currentTime = next;
        setCurrent(next);
    };

    const toggle = () => {
        const audio = audioRef.current;
        if (!audio || !src) {
            return;
        }
        if (playing) {
            audio.pause();
            setPlaying(false);
            return;
        }
        audio.play()
            .then(() => {
                setPlaying(true);
                setMediaError(false);
            })
            .catch((err: unknown) => {
                if (!isPlayAbort(err)) {
                    setMediaError(true);
                }
            });
    };

    const onPlayerKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) {
            return;
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            seekBy(5);
        }
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            seekBy(-5);
        }
    };

    return (
        <section
            className={css.player}
            aria-label="Плеер"
            tabIndex={0}
            onKeyDown={onPlayerKeyDown}
        >
            <audio
                ref={audioRef}
                preload="metadata"
                onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
                onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
                onEnded={() => setPlaying(false)}
                onPlay={() => {
                    setPlaying(true);
                    setMediaError(false);
                }}
                onPause={() => setPlaying(false)}
                onError={() => {
                    if (audioRef.current?.error?.code === MediaError.MEDIA_ERR_ABORTED) {
                        return;
                    }
                    setMediaError(true);
                }}
            />
            <div className={css.top}>
                {coverUrl && !coverFailed ? (
                    <img
                        className={css.cover}
                        src={coverUrl}
                        alt={`Обложка «${title}»`}
                        onError={() => setCoverFailed(true)}
                    />
                ) : (
                    <span className={css.disc} aria-hidden="true">
                        <MusicNoteIcon className={css.discIcon} />
                    </span>
                )}
                <div className={css.meta}>
                    <p className={css.title}>{title}</p>
                    {isPlaceholderCredit(credits) ? null : (
                        <p className={css.credits}>{credits}</p>
                    )}
                </div>
            </div>
            <div className={css.controls}>
                {onPrevious && onNext ? (
                    <button
                        type="button"
                        className={css.iconButton}
                        onClick={onPrevious}
                        disabled={!hasPrevious}
                        aria-label="Предыдущая запись"
                    >
                        <PreviousIcon className={css.glyph} />
                    </button>
                ) : null}
                <button
                    type="button"
                    className={css.play}
                    onClick={toggle}
                    disabled={!src}
                    aria-pressed={playing}
                    aria-label={playing ? `Пауза: ${title}` : `Слушать: ${title}`}
                >
                    {playing ? <PauseIcon className={css.glyph} /> : <PlayIcon className={css.glyph} />}
                </button>
                {onPrevious && onNext ? (
                    <button
                        type="button"
                        className={css.iconButton}
                        onClick={onNext}
                        disabled={!hasNext}
                        aria-label="Следующая запись"
                    >
                        <NextIcon className={css.glyph} />
                    </button>
                ) : null}
            </div>
            <div className={css.seekRow}>
                <span className={css.time}>{formatTime(current)}</span>
                <input
                    className={css.seek}
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={Number.isFinite(current) ? current : 0}
                    style={{
                        '--fill': `${duration ? Math.min(100, (current / duration) * 100) : 0}%`,
                    } as React.CSSProperties}
                    disabled={!duration}
                    aria-label="Позиция воспроизведения"
                    aria-valuemin={0}
                    aria-valuemax={Math.floor(duration || 0)}
                    aria-valuenow={Math.floor(current)}
                    aria-valuetext={formatTime(current)}
                    onChange={(event) => {
                        const next = Number(event.target.value);
                        if (audioRef.current) {
                            audioRef.current.currentTime = next;
                        }
                        setCurrent(next);
                    }}
                />
                <span className={css.time}>{formatTime(duration)}</span>
            </div>
            <div className={css.volumeRow}>
                <button
                    type="button"
                    className={css.iconButton}
                    onClick={() => setMuted((value) => !value)}
                    aria-label={muted || volume === 0 ? 'Включить звук' : 'Выключить звук'}
                    aria-pressed={muted || volume === 0}
                >
                    {muted || volume === 0
                        ? <VolumeOffIcon className={css.glyph} />
                        : <VolumeIcon className={css.glyph} />}
                </button>
                <input
                    className={css.volume}
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    style={{ '--fill': `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
                    aria-label="Громкость"
                    onChange={(event) => {
                        const next = Number(event.target.value);
                        setVolume(next);
                        setMuted(next === 0);
                    }}
                />
            </div>
            {description ? <p className={css.description}>{description}</p> : null}
            {mediaError ? (
                <p className={css.error} role="alert">Не удалось воспроизвести запись.</p>
            ) : null}
        </section>
    );
};
