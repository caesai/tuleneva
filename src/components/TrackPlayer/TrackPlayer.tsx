/**
 * @file Один плеер: play/pause, перемотка, без autoplay.
 */
import React, { useEffect, useRef, useState } from 'react';
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
}) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);
    const [mediaError, setMediaError] = useState(false);
    const [coverFailed, setCoverFailed] = useState(false);

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
                    <span className={css.disc} aria-hidden="true" />
                )}
                <div className={css.meta}>
                    <p className={css.title}>{title}</p>
                    <p className={css.credits}>{credits}</p>
                </div>
                <button
                    type="button"
                    className={css.play}
                    onClick={toggle}
                    disabled={!src}
                    aria-pressed={playing}
                    aria-label={playing ? `Пауза: ${title}` : `Слушать: ${title}`}
                >
                    {playing ? 'Пауза' : 'Слушать'}
                </button>
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
            {description ? <p className={css.description}>{description}</p> : null}
            {mediaError ? (
                <p className={css.error} role="alert">Не удалось воспроизвести запись.</p>
            ) : null}
        </section>
    );
};
