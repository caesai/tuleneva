/**
 * @file Публикация музыки. Сервер пускает только super_admin; страница повторяет эту границу.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    createCollection,
    createMusicDraft,
    deleteMusicTrack,
    fetchManageCollections,
    fetchManageTracks,
    fetchTrackBlob,
    publishMusicTrack,
    trackAudioUrl,
    trackCoverUrl,
    unpublishMusicTrack,
    updateMusicTrack,
} from '@/api/music.api.ts';
import { AdminCollections } from '@/pages/AdminMusicPage/AdminCollections.tsx';
import { TrackPlayer } from '@/components/TrackPlayer/TrackPlayer.tsx';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';
import { Loader } from '@/components/Loader/Loader.tsx';
import { useAuth } from '@/hooks/useAuth.ts';
import { prepareCoverFile } from '@/music/prepareCover.ts';
import type { IMusicCollection, IMusicTrack } from '@/types/music.types.ts';
import css from './AdminMusicPage.module.css';

interface PlayerSource {
    src: string;
    title: string;
    credits: string;
    description: string | null;
    coverUrl: string | null;
    revoke?: boolean;
}

/**
 * Форма черновика, явная публикация и снятие с эфира.
 * Обложка с телефона сжимается в JPEG до отправки: галерея отдаёт HEIC и снимки больше 2 МБ.
 * Список запрашивается после сессии; 401/403 на первом заходе повторяются один раз.
 * @returns Страница /admin/music
 */
export const AdminMusicPage: React.FC = () => {
    const { capabilities, isLoading, authStatus } = useAuth();
    const [tracks, setTracks] = useState<IMusicTrack[]>([]);
    const [collections, setCollections] = useState<IMusicCollection[]>([]);
    const [albumChoice, setAlbumChoice] = useState('');
    const [newAlbumTitle, setNewAlbumTitle] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [credits, setCredits] = useState('');
    const [description, setDescription] = useState('');
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverBusy, setCoverBusy] = useState(false);
    const coverInputRef = useRef<HTMLInputElement>(null);
    const errorRef = useRef<HTMLParagraphElement>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [player, setPlayer] = useState<PlayerSource | null>(null);
    const [playRequest, setPlayRequest] = useState(0);
    const [pending, setPending] = useState<{ id: string; action: 'unpublish' | 'delete'; title: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        const read = async () => {
            try {
                return await fetchManageTracks();
            } catch (err) {
                const status = (err as { status?: number }).status;
                if (status === 401 || status === 403) {
                    return fetchManageTracks();
                }
                throw err;
            }
        };
        try {
            const [nextTracks, nextCollections] = await Promise.all([
                read(),
                fetchManageCollections().catch((err: unknown) => {
                    const status = (err as { status?: number }).status;
                    if (status === 401 || status === 403) {
                        return fetchManageCollections();
                    }
                    throw err;
                }),
            ]);
            setTracks(nextTracks);
            setCollections(nextCollections);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось загрузить записи.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isLoading || authStatus === 'loading' || !capabilities.isSuperAdmin) {
            return;
        }
        void load();
    }, [authStatus, capabilities.isSuperAdmin, isLoading, load]);

    useEffect(() => {
        const node = errorRef.current;
        if (error && node && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ block: 'nearest' });
        }
    }, [error]);

    useEffect(() => () => {
        if (player?.revoke) {
            URL.revokeObjectURL(player.src);
        }
    }, [player]);

    const resetForm = () => {
        setTitle('');
        setCredits('');
        setDescription('');
        setAudioFile(null);
        setCoverFile(null);
        setEditingId(null);
        setAlbumChoice('');
        setNewAlbumTitle('');
    };

    /**
     * Ставит в единственный плеер локальный файл, без автозапуска.
     * @param file Выбранный MP3
     */
    const previewFile = (file: File | null) => {
        setAudioFile(file);
        if (!file) {
            return;
        }
        const src = URL.createObjectURL(file);
        setPlayer({
            src,
            title: title || file.name,
            credits: credits || 'Предпросмотр',
            description: description || null,
            coverUrl: coverFile ? URL.createObjectURL(coverFile) : null,
            revoke: true,
        });
        setPlayRequest(0);
    };

    /**
     * Сжимает фото из галереи сразу после выбора и показывает ошибку, не дожидаясь отправки.
     * @param file Выбранный файл или null, если поле очистили
     */
    const onCoverPicked = async (file: File | null) => {
        if (!file) {
            setCoverFile(null);
            return;
        }
        setCoverBusy(true);
        setError(null);
        try {
            setCoverFile(await prepareCoverFile(file));
        } catch (err) {
            setCoverFile(null);
            if (coverInputRef.current) {
                coverInputRef.current.value = '';
            }
            setError(err instanceof Error ? err.message : 'Не удалось прочитать обложку.');
        } finally {
            setCoverBusy(false);
        }
    };

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!editingId && !audioFile) {
            setError('Выберите MP3.');
            return;
        }
        const body = new FormData();
        body.set('title', title);
        body.set('credits', credits);
        body.set('description', description);
        if (audioFile) {
            body.set('audio', audioFile);
        }
        if (coverFile) {
            body.set('cover', coverFile);
        }
        let albumId = albumChoice === '__new__' ? '' : albumChoice;
        if (albumChoice === '__new__') {
            const albumTitle = newAlbumTitle.trim();
            if (!albumTitle) {
                setError('Название альбома нужно.');
                return;
            }
            try {
                const createdAlbum = await createCollection({
                    type: 'album',
                    title: albumTitle,
                    description: '',
                });
                albumId = createdAlbum.id;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Не удалось создать альбом.');
                return;
            }
        }
        if (albumId) {
            body.set('albumId', albumId);
        } else if (editingId) {
            body.set('albumId', '');
        }
        setSaving(true);
        setError(null);
        try {
            if (editingId) {
                await updateMusicTrack(editingId, body);
            } else {
                await createMusicDraft(body);
            }
            resetForm();
            setPlayer(null);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось сохранить.');
        } finally {
            setSaving(false);
        }
    };

    const beginEdit = (track: IMusicTrack) => {
        setEditingId(track.id);
        setTitle(track.title);
        setCredits(track.credits);
        setDescription(track.description || '');
        setAudioFile(null);
        setCoverFile(null);
        setAlbumChoice(track.albumId || '');
        setNewAlbumTitle('');
        setError(null);
    };

    /**
     * Слушает сохранённую запись. Черновик качается с JWT, опубликованная — прямым URL.
     * @param track Запись
     */
    const listen = async (track: IMusicTrack) => {
        setError(null);
        try {
            if (track.status === 'published') {
                setPlayer({
                    src: trackAudioUrl(track.id),
                    title: track.title,
                    credits: track.credits,
                    description: track.description,
                    coverUrl: track.hasCover ? trackCoverUrl(track.id) : null,
                });
            } else {
                const src = await fetchTrackBlob(trackAudioUrl(track.id));
                setPlayer({
                    src,
                    title: track.title,
                    credits: track.credits,
                    description: track.description,
                    coverUrl: null,
                    revoke: true,
                });
            }
            setPlayRequest((value) => value + 1);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось открыть файл.');
        }
    };

    const confirmPending = async () => {
        if (!pending) {
            return;
        }
        setError(null);
        try {
            if (pending.action === 'delete') {
                await deleteMusicTrack(pending.id);
            } else {
                await unpublishMusicTrack(pending.id);
            }
            if (editingId === pending.id) {
                resetForm();
            }
            setPending(null);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось выполнить действие.');
        }
    };

    if (isLoading || authStatus === 'loading') {
        return (
            <main className={css.page} aria-busy="true">
                <Loader fullScreen={false} />
            </main>
        );
    }

    if (!capabilities.isSuperAdmin) {
        return (
            <main className={css.page}>
                <p>Публиковать музыку может только супер-админ.</p>
                <Link to="/admin">К пользователям</Link>
            </main>
        );
    }

    return (
        <main className={css.page}>
            <header className={css.header}>
                <Link to="/admin">Назад</Link>
                <h1>Музыка</h1>
            </header>
            <p className={css.lead}>
                Черновик слышите вы. Гости увидят запись только после «Опубликовать».
                Файлы уходят в объектное хранилище, не в базу.
            </p>

            {error ? <p ref={errorRef} className={css.error} role="alert">{error}</p> : null}

            <form className={css.form} onSubmit={onSubmit}>
                <h2>{editingId ? 'Правка' : 'Новая запись'}</h2>
                <label>
                    Название
                    <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} />
                </label>
                <label>
                    Кто играет
                    <input value={credits} onChange={(event) => setCredits(event.target.value)} required maxLength={160} />
                </label>
                <label>
                    Описание
                    <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        maxLength={500}
                        rows={3}
                    />
                </label>
                <label>
                    MP3
                    <span className={css.filePicker}>
                        <input
                            className={css.fileInput}
                            type="file"
                            accept="audio/mpeg,.mp3"
                            aria-label="Файл MP3"
                            onChange={(event) => previewFile(event.target.files?.[0] ?? null)}
                        />
                        <span className={css.fileButton}>Выбрать MP3</span>
                        <span className={css.fileName}>{audioFile ? audioFile.name : 'файл не выбран'}</span>
                    </span>
                </label>
                <label>
                    Альбом
                    <select
                        aria-label="Альбом"
                        value={albumChoice}
                        onChange={(event) => setAlbumChoice(event.target.value)}
                    >
                        <option value="">Без альбома</option>
                        {collections
                            .filter((collection) => collection.type === 'album')
                            .map((collection) => (
                                <option key={collection.id} value={collection.id}>
                                    {collection.title}
                                </option>
                            ))}
                        <option value="__new__">Новый альбом…</option>
                    </select>
                </label>
                {albumChoice === '__new__' ? (
                    <label>
                        Название альбома
                        <input
                            aria-label="Название альбома"
                            value={newAlbumTitle}
                            onChange={(event) => setNewAlbumTitle(event.target.value)}
                            maxLength={120}
                        />
                    </label>
                ) : null}
                <label>
                    Обложка
                    <span className={css.filePicker}>
                        <input
                            ref={coverInputRef}
                            className={css.fileInput}
                            type="file"
                            accept="image/*,.heic,.heif"
                            aria-label="Обложка"
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
                        {saving ? 'Сохранение…' : editingId ? 'Сохранить' : 'Сохранить черновик'}
                    </button>
                    {editingId ? (
                        <button type="button" className={css.quiet} onClick={resetForm}>
                            Отмена
                        </button>
                    ) : null}
                </div>
            </form>

            {player ? (
                <TrackPlayer
                    title={player.title}
                    credits={player.credits}
                    description={player.description}
                    coverUrl={player.coverUrl}
                    src={player.src}
                    playRequest={playRequest}
                />
            ) : null}

            {loading ? (
                <div aria-busy="true" aria-label="Загрузка записей">
                    <Loader fullScreen={false} />
                </div>
            ) : (
                <ul className={css.list}>
                    {tracks.map((track) => (
                        <li key={track.id} className={css.card}>
                            <div>
                                <p className={css.cardTitle}>{track.title}</p>
                                <p className={css.cardCredits}>
                                    {track.credits}
                                    {track.albumTitle ? ` · ${track.albumTitle}` : ''}
                                </p>
                                <p className={track.status === 'published' ? css.published : css.draft}>
                                    {track.status === 'published' ? 'Опубликовано' : 'Черновик'}
                                </p>
                            </div>
                            <div className={css.cardActions}>
                                <button type="button" onClick={() => listen(track)}>
                                    Слушать
                                </button>
                                <button type="button" onClick={() => beginEdit(track)}>
                                    Изменить
                                </button>
                                {track.status === 'published' ? (
                                    <button
                                        type="button"
                                        onClick={() => setPending({ id: track.id, action: 'unpublish', title: track.title })}
                                    >
                                        Снять с публикации
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void publishMusicTrack(track.id)
                                                .then(() => load())
                                                .catch((err: unknown) => {
                                                    setError(err instanceof Error ? err.message : 'Не удалось опубликовать.');
                                                });
                                        }}
                                    >
                                        Опубликовать
                                    </button>
                                )}
                                <button
                                    type="button"
                                    className={css.danger}
                                    onClick={() => setPending({ id: track.id, action: 'delete', title: track.title })}
                                >
                                    Удалить
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <AdminCollections
                collections={collections}
                tracks={tracks}
                onReload={() => void load()}
                onError={setError}
            />

            <ModalPopup isOpen={pending !== null} onClose={() => setPending(null)}>
                {pending ? (
                    <div role="dialog" aria-modal="true" aria-labelledby="music-confirm-title">
                        <h3 id="music-confirm-title">
                            {pending.action === 'delete'
                                ? `Удалить «${pending.title}»?`
                                : `Снять «${pending.title}» с публикации?`}
                        </h3>
                        <p>
                            {pending.action === 'delete'
                                ? 'Файл и карточка исчезнут. Это нельзя отменить.'
                                : 'Гости перестанут видеть запись. Черновик останется у вас.'}
                        </p>
                        <div className={css.formActions}>
                            <button type="button" className={css.danger} onClick={() => void confirmPending()}>
                                {pending.action === 'delete' ? 'Удалить' : 'Снять'}
                            </button>
                            <button type="button" className={css.quiet} onClick={() => setPending(null)}>
                                Отмена
                            </button>
                        </div>
                    </div>
                ) : null}
            </ModalPopup>
        </main>
    );
};
