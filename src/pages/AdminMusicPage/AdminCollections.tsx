/**
 * @file Альбомы и плейлисты в админке: обложка, состав, порядок кнопками вверх и вниз.
 */
import React, { useRef, useState } from 'react';
import {
    collectionCoverUrl,
    createCollection,
    deleteCollection,
    publishCollection,
    setCollectionTracks,
    unpublishCollection,
    updateCollection,
} from '@/api/music.api.ts';
import { prepareCoverFile } from '@/music/prepareCover.ts';
import type { IMusicCollection, IMusicTrack, TMusicCollectionType } from '@/types/music.types.ts';
import css from './AdminMusicPage.module.css';

interface AdminCollectionsProps {
    /** Уже загруженные подборки. */
    collections: IMusicCollection[];
    /** Все записи, из них выбирают состав. */
    tracks: IMusicTrack[];
    /** Перечитать списки после сохранения. */
    onReload: () => void;
    /** Сообщение об ошибке на всю страницу. */
    onError: (message: string | null) => void;
}

/**
 * Создание и правка подборок. В альбоме запись может быть только одна:
 * если она была в другом альбоме, сервер переносит её сюда.
 * @param props Списки и перезагрузка
 * @returns Секция на /admin/music
 */
export const AdminCollections: React.FC<AdminCollectionsProps> = ({
    collections,
    tracks,
    onReload,
    onError,
}) => {
    const [type, setType] = useState<TMusicCollectionType>('album');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverBusy, setCoverBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
    const [pick, setPick] = useState('');
    const coverInputRef = useRef<HTMLInputElement>(null);
    const editing = collections.find((collection) => collection.id === editingId) ?? null;

    const reset = () => {
        setTitle('');
        setDescription('');
        setCoverFile(null);
        setType('album');
        setEditingId(null);
        setEditTitle('');
        setEditDescription('');
        setEditCoverFile(null);
        setPick('');
    };

    /**
     * Сжимает обложку так же, как у записи.
     * @param file Файл из галереи
     */
    const onCoverPicked = async (file: File | null) => {
        if (!file) {
            setCoverFile(null);
            return;
        }
        setCoverBusy(true);
        onError(null);
        try {
            setCoverFile(await prepareCoverFile(file));
        } catch (err) {
            setCoverFile(null);
            if (coverInputRef.current) {
                coverInputRef.current.value = '';
            }
            onError(err instanceof Error ? err.message : 'Не удалось прочитать обложку.');
        } finally {
            setCoverBusy(false);
        }
    };

    const onCreate = async (event: React.FormEvent) => {
        event.preventDefault();
        setSaving(true);
        onError(null);
        try {
            const created = await createCollection({
                type,
                title: title.trim(),
                description: description.trim(),
            });
            if (coverFile) {
                const body = new FormData();
                body.set('title', title.trim());
                body.set('description', description.trim());
                body.set('cover', coverFile);
                await updateCollection(created.id, body);
            }
            reset();
            onReload();
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Не удалось создать подборку.');
            onReload();
        } finally {
            setSaving(false);
        }
    };

    const beginEdit = (collection: IMusicCollection) => {
        setEditingId(collection.id);
        setEditTitle(collection.title);
        setEditDescription(collection.description || '');
        setEditCoverFile(null);
        setPick('');
        onError(null);
    };

    const saveDetails = async () => {
        if (!editing) {
            return;
        }
        setSaving(true);
        onError(null);
        try {
            const body = new FormData();
            body.set('title', editTitle.trim());
            body.set('description', editDescription.trim());
            if (editCoverFile) {
                body.set('cover', editCoverFile);
            }
            await updateCollection(editing.id, body);
            setEditCoverFile(null);
            onReload();
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Не удалось сохранить подборку.');
        } finally {
            setSaving(false);
        }
    };

    /**
     * Пишет новый порядок и перечитывает список.
     * @param trackIds Сверху вниз
     */
    const writeOrder = async (trackIds: string[]) => {
        if (!editing) {
            return;
        }
        setSaving(true);
        onError(null);
        try {
            await setCollectionTracks(editing.id, trackIds);
            onReload();
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Не удалось сохранить порядок.');
        } finally {
            setSaving(false);
        }
    };

    const move = (index: number, direction: -1 | 1) => {
        const items = editing?.tracks ?? [];
        const target = index + direction;
        if (target < 0 || target >= items.length) {
            return undefined;
        }
        const next = [...items];
        const [item] = next.splice(index, 1);
        next.splice(target, 0, item);
        return writeOrder(next.map((track) => track.id));
    };

    const removeTrack = (trackId: string) => {
        const items = editing?.tracks ?? [];
        return writeOrder(items.filter((track) => track.id !== trackId).map((track) => track.id));
    };

    const addTrack = () => {
        if (!pick || !editing) {
            return undefined;
        }
        const items = editing.tracks ?? [];
        setPick('');
        return writeOrder([...items.map((track) => track.id), pick]);
    };

    const publish = async (collection: IMusicCollection) => {
        onError(null);
        try {
            if (collection.status === 'published') {
                await unpublishCollection(collection.id);
            } else {
                await publishCollection(collection.id);
            }
            onReload();
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Не удалось изменить публикацию.');
        }
    };

    const removeCollection = async (collection: IMusicCollection) => {
        if (!window.confirm(`Удалить «${collection.title}»? Записи останутся.`)) {
            return;
        }
        onError(null);
        try {
            await deleteCollection(collection.id);
            if (editingId === collection.id) {
                reset();
            }
            onReload();
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Не удалось удалить подборку.');
        }
    };

    const usedIds = new Set((editing?.tracks ?? []).map((track) => track.id));
    const available = tracks.filter((track) => !usedIds.has(track.id));

    return (
        <section className={css.section}>
            <h2>Альбомы и плейлисты</h2>
            <p className={css.lead}>
                В альбоме запись одна. Если она была в другом альбоме, она перейдёт сюда.
                Плейлист можно собирать из любых записей.
            </p>
            <form className={css.form} onSubmit={onCreate}>
                <h3>Новая подборка</h3>
                <label>
                    Тип
                    <select
                        aria-label="Тип подборки"
                        value={type}
                        onChange={(event) => setType(event.target.value as TMusicCollectionType)}
                    >
                        <option value="album">Альбом</option>
                        <option value="playlist">Плейлист</option>
                    </select>
                </label>
                <label>
                    Название подборки
                    <input
                        aria-label="Название подборки"
                        value={title}
                        onChange={(event) => setTitle(event.target.value)}
                        required
                        maxLength={120}
                    />
                </label>
                <label>
                    Описание подборки
                    <textarea
                        aria-label="Описание подборки"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        maxLength={500}
                        rows={3}
                    />
                </label>
                <label>
                    Обложка подборки
                    <span className={css.filePicker}>
                        <input
                            ref={coverInputRef}
                            className={css.fileInput}
                            type="file"
                            accept="image/*,.heic,.heif"
                            aria-label="Обложка подборки"
                            onChange={(event) => void onCoverPicked(event.target.files?.[0] ?? null)}
                        />
                        <span className={css.fileButton}>Выбрать обложку</span>
                        <span className={css.fileName}>
                            {coverBusy ? 'Сжимаем фото…' : coverFile ? coverFile.name : 'необязательно'}
                        </span>
                    </span>
                </label>
                <div className={css.formActions}>
                    <button type="submit" disabled={saving || coverBusy}>
                        {saving ? 'Сохранение…' : 'Создать подборку'}
                    </button>
                </div>
            </form>

            <ul className={css.list}>
                {collections.map((collection) => (
                    <li key={collection.id} className={css.card}>
                        <div className={css.collectionHead}>
                            {collection.hasCover ? (
                                <img
                                    className={css.collectionCover}
                                    src={collectionCoverUrl(collection.id)}
                                    alt=""
                                />
                            ) : (
                                <span className={css.collectionCoverEmpty} aria-hidden="true" />
                            )}
                            <div>
                                <p className={css.cardTitle}>{collection.title}</p>
                                <p className={css.cardCredits}>
                                    {collection.type === 'album' ? 'Альбом' : 'Плейлист'}
                                    {' · '}
                                    {collection.trackCount}
                                </p>
                                <p className={collection.status === 'published' ? css.published : css.draft}>
                                    {collection.status === 'published' ? 'Опубликовано' : 'Черновик'}
                                </p>
                            </div>
                        </div>
                        <div className={css.cardActions}>
                            <button type="button" onClick={() => beginEdit(collection)}>
                                {`Состав: ${collection.title}`}
                            </button>
                            <button type="button" onClick={() => void publish(collection)}>
                                {collection.status === 'published' ? 'Снять подборку' : 'Опубликовать подборку'}
                            </button>
                            <button
                                type="button"
                                className={css.danger}
                                onClick={() => void removeCollection(collection)}
                            >
                                Удалить подборку
                            </button>
                        </div>
                        {editing?.id === collection.id ? (
                            <div className={css.editor}>
                                <label>
                                    Название подборки
                                    <input
                                        aria-label="Правка названия"
                                        value={editTitle}
                                        onChange={(event) => setEditTitle(event.target.value)}
                                        maxLength={120}
                                    />
                                </label>
                                <label>
                                    Описание подборки
                                    <textarea
                                        aria-label="Правка описания"
                                        value={editDescription}
                                        onChange={(event) => setEditDescription(event.target.value)}
                                        maxLength={500}
                                        rows={3}
                                    />
                                </label>
                                <label>
                                    Новая обложка
                                    <span className={css.filePicker}>
                                        <input
                                            className={css.fileInput}
                                            type="file"
                                            accept="image/*,.heic,.heif"
                                            aria-label="Новая обложка подборки"
                                            onChange={(event) => {
                                                const file = event.target.files?.[0] ?? null;
                                                if (!file) {
                                                    setEditCoverFile(null);
                                                    return;
                                                }
                                                setCoverBusy(true);
                                                void prepareCoverFile(file)
                                                    .then(setEditCoverFile)
                                                    .catch((err: unknown) => {
                                                        setEditCoverFile(null);
                                                        onError(err instanceof Error ? err.message : 'Не удалось прочитать обложку.');
                                                    })
                                                    .finally(() => setCoverBusy(false));
                                            }}
                                        />
                                        <span className={css.fileButton}>Выбрать обложку</span>
                                        <span className={css.fileName}>
                                            {editCoverFile ? editCoverFile.name : 'не менять'}
                                        </span>
                                    </span>
                                </label>
                                <div className={css.formActions}>
                                    <button type="button" disabled={saving || coverBusy} onClick={() => void saveDetails()}>
                                        Сохранить подборку
                                    </button>
                                    <button type="button" className={css.quiet} onClick={reset}>
                                        Закрыть
                                    </button>
                                </div>
                                <ol className={css.orderList}>
                                    {(editing.tracks ?? []).map((track, index) => (
                                        <li key={track.id} className={css.orderItem}>
                                            <span className={css.orderTitle}>
                                                {track.title}
                                                {track.status === 'draft' ? ' · черновик' : ''}
                                            </span>
                                            <button
                                                type="button"
                                                className={css.orderButton}
                                                aria-label={`Выше: ${track.title}`}
                                                disabled={saving || index === 0}
                                                onClick={() => move(index, -1)}
                                            >
                                                Вверх
                                            </button>
                                            <button
                                                type="button"
                                                className={css.orderButton}
                                                aria-label={`Ниже: ${track.title}`}
                                                disabled={saving || index === (editing.tracks ?? []).length - 1}
                                                onClick={() => move(index, 1)}
                                            >
                                                Вниз
                                            </button>
                                            <button
                                                type="button"
                                                className={css.orderButton}
                                                aria-label={`Убрать: ${track.title}`}
                                                disabled={saving}
                                                onClick={() => removeTrack(track.id)}
                                            >
                                                Убрать
                                            </button>
                                        </li>
                                    ))}
                                </ol>
                                <div className={css.orderItem}>
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
                                    <button type="button" className={css.orderButton} disabled={!pick || saving} onClick={addTrack}>
                                        Добавить
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </li>
                ))}
            </ul>
        </section>
    );
};
