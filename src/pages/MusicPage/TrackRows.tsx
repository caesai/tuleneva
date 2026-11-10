/**
 * @file Строки записей: выбрать, слушать, ссылка. Плеер живёт у родителя.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { PauseIcon, PlayIcon } from '@/components/TrackPlayer/PlayerIcons.tsx';
import { trackCoverUrl } from '@/api/music.api.ts';
import type { IMusicTrack } from '@/types/music.types.ts';
import css from './MusicPage.module.css';

interface TrackRowsProps {
    /** Записи сверху вниз. */
    tracks: IMusicTrack[];
    /** Какая строка сейчас в плеере. */
    currentId?: string | null;
    /** Идёт ли звук этой строки. */
    playing: boolean;
    /** Открыть запись без старта. */
    onSelect: (id: string) => void;
    /** Слушать или поставить на паузу. */
    onPress: (id: string) => void;
}

/**
 * Список записей с кнопкой play/pause.
 * @param props Состав и жесты
 * @returns Список
 */
export const TrackRows: React.FC<TrackRowsProps> = ({
    tracks,
    currentId,
    playing,
    onSelect,
    onPress,
}) => (
    <ul className={css.list}>
        {tracks.map((track) => {
            const current = track.id === currentId;
            return (
                <li key={track.id} className={current ? css.itemCurrent : css.item}>
                    <button
                        type="button"
                        className={css.itemMain}
                        onClick={() => onSelect(track.id)}
                        aria-current={current ? 'true' : undefined}
                    >
                        {track.hasCover ? (
                            <img className={css.thumb} src={trackCoverUrl(track.id)} alt="" />
                        ) : (
                            <span className={css.thumbEmpty} aria-hidden="true" />
                        )}
                        <span className={css.itemText}>
                            <span className={css.itemTitle}>{track.title}</span>
                            <span className={css.itemCredits}>{track.credits}</span>
                        </span>
                    </button>
                    <button
                        type="button"
                        className={css.rowPlay}
                        onClick={() => onPress(track.id)}
                        aria-label={current && playing ? `Пауза: ${track.title}` : `Слушать: ${track.title}`}
                    >
                        {current && playing
                            ? <PauseIcon className={css.rowIcon} />
                            : <PlayIcon className={css.rowIcon} />}
                    </button>
                    <Link className={css.share} to={`/music/${track.id}`}>
                        Ссылка
                    </Link>
                </li>
            );
        })}
    </ul>
);
