/**
 * @file Строки записей: выбрать, слушать, ссылка. Плеер живёт у родителя.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { LinkIcon, MusicNoteIcon } from '@/components/Icons/Icons.tsx';
import { PauseIcon, PlayIcon } from '@/components/TrackPlayer/PlayerIcons.tsx';
import { trackCoverUrl } from '@/api/music.api.ts';
import type { IMusicTrack } from '@/types/music.types.ts';
import { isPlaceholderCredit } from './credits.ts';
import css from './MusicPage.module.css';

interface TrackRowsProps {
    /** Записи сверху вниз. */
    tracks: IMusicTrack[];
    /** Какая строка сейчас в плеере. */
    currentId?: string | null;
    /** Идёт ли звук этой строки. */
    playing: boolean;
    /** Обложка альбома или плейлиста, если у записи своей нет. */
    fallbackCoverUrl?: string | null;
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
    fallbackCoverUrl,
    onSelect,
    onPress,
}) => (
    <ul className={css.list}>
        {tracks.map((track) => {
            const current = track.id === currentId;
            const cover = track.hasCover ? trackCoverUrl(track.id) : fallbackCoverUrl;
            return (
                <li key={track.id} className={current ? css.itemCurrent : css.item}>
                    <button
                        type="button"
                        className={css.itemMain}
                        onClick={() => onSelect(track.id)}
                        aria-current={current ? 'true' : undefined}
                    >
                        {cover ? (
                            <img className={css.thumb} src={cover} alt="" />
                        ) : (
                            <span className={css.thumbEmpty} aria-hidden="true">
                                <MusicNoteIcon className={css.placeholderIcon} />
                            </span>
                        )}
                        <span className={css.itemText}>
                            <span className={css.itemTitle}>{track.title}</span>
                            {isPlaceholderCredit(track.credits) ? null : (
                                <span className={css.itemCredits}>{track.credits}</span>
                            )}
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
                    <Link
                        className={css.share}
                        to={`/music/${track.id}`}
                        aria-label={`Ссылка на «${track.title}»`}
                        title={`Ссылка на «${track.title}»`}
                    >
                        <LinkIcon className={css.shareGlyph} />
                    </Link>
                </li>
            );
        })}
    </ul>
);
