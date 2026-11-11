/**
 * @file Состав альбома или плейлиста: добавить, убрать, поднять и опустить.
 */
import React, { useState } from 'react';
import { setCollectionTracks } from '@/api/music.api.ts';
import { ChevronDownIcon, ChevronUpIcon, MinusIcon, PlusIcon } from '@/components/Icons/Icons.tsx';
import type { IMusicCollection, IMusicTrack } from '@/types/music.types.ts';
import css from './AdminMusicPage.module.css';

interface CollectionTracksSheetProps {
    /** Подборка с актуальным составом. */
    collection: IMusicCollection;
    /** Все записи, из них выбирают недостающие. */
    tracks: IMusicTrack[];
    /** Текст ошибки страницы. */
    error: string | null;
    /** Перечитать списки после сохранения порядка. */
    onReload: () => void;
    /** Сообщить ошибку на страницу. */
    onError: (message: string | null) => void;
}

/**
 * В альбоме запись одна: если она была в другом, сервер переносит её сюда.
 * Плейлист собирается из любых записей.
 * @param props Подборка и полный список записей
 * @returns Редактор порядка
 */
export const CollectionTracksSheet: React.FC<CollectionTracksSheetProps> = ({
    collection,
    tracks,
    error,
    onReload,
    onError,
}) => {
    const [pick, setPick] = useState('');
    const [saving, setSaving] = useState(false);
    const items = collection.tracks ?? [];
    const usedIds = new Set(items.map((track) => track.id));
    const available = tracks.filter((track) => !usedIds.has(track.id));

    const writeOrder = async (trackIds: string[]) => {
        setSaving(true);
        onError(null);
        try {
            await setCollectionTracks(collection.id, trackIds);
            onReload();
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Не удалось сохранить порядок.');
        } finally {
            setSaving(false);
        }
    };

    const move = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= items.length) {
            return undefined;
        }
        const next = [...items];
        const [item] = next.splice(index, 1);
        next.splice(target, 0, item);
        return writeOrder(next.map((track) => track.id));
    };

    const addTrack = () => {
        if (!pick) {
            return;
        }
        const nextIds = [...items.map((track) => track.id), pick];
        setPick('');
        void writeOrder(nextIds);
    };

    return (
        <div className={css.form}>
            {error ? <p className={css.error} role="alert">{error}</p> : null}
            <p className={css.hint}>
                {collection.type === 'album'
                    ? 'В альбоме запись одна. Если она была в другом альбоме, она перейдёт сюда.'
                    : 'Плейлист можно собирать из любых записей.'}
            </p>
            <ol className={css.orderList}>
                {items.map((track, index) => (
                    <li key={track.id} className={css.orderItem}>
                        <span className={css.orderTitle}>
                            {track.title}
                            {track.status === 'draft' ? ' · черновик' : ''}
                        </span>
                        <button
                            type="button"
                            className={css.orderButton}
                            aria-label={`Выше: ${track.title}`}
                            title="Выше"
                            disabled={saving || index === 0}
                            onClick={() => move(index, -1)}
                        >
                            <ChevronUpIcon className={css.rowIcon} />
                        </button>
                        <button
                            type="button"
                            className={css.orderButton}
                            aria-label={`Ниже: ${track.title}`}
                            title="Ниже"
                            disabled={saving || index === items.length - 1}
                            onClick={() => move(index, 1)}
                        >
                            <ChevronDownIcon className={css.rowIcon} />
                        </button>
                        <button
                            type="button"
                            className={css.orderButton}
                            aria-label={`Убрать: ${track.title}`}
                            title="Убрать"
                            disabled={saving}
                            onClick={() => void writeOrder(items.filter((item) => item.id !== track.id).map((item) => item.id))}
                        >
                            <MinusIcon className={css.rowIcon} />
                        </button>
                    </li>
                ))}
            </ol>
            <div className={css.orderAdd}>
                <select
                    aria-label="Добавить запись"
                    value={pick}
                    onChange={(event) => setPick(event.target.value)}
                >
                    <option value="">Выберите запись</option>
                    {available.map((track) => (
                        <option key={track.id} value={track.id}>{track.title}</option>
                    ))}
                </select>
                <button
                    type="button"
                    className={css.orderButton}
                    aria-label="Добавить"
                    title="Добавить"
                    disabled={!pick || saving}
                    onClick={addTrack}
                >
                    <PlusIcon className={css.rowIcon} />
                </button>
            </div>
        </div>
    );
};
