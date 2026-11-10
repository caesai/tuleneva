/**
 * @file Публикация музыки. Сервер пускает только super_admin; страница повторяет эту границу.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    createMusicDraft,
    deleteMusicTrack,
    fetchManageTracks,
    fetchTrackBlob,
    publishMusicTrack,
    trackAudioUrl,
    trackCoverUrl,
    unpublishMusicTrack,
    updateMusicTrack,
} from '@/api/music.api.ts';
import { TrackPlayer } from '@/components/TrackPlayer/TrackPlayer.tsx';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';
import { Loader } from '@/components/Loader/Loader.tsx';
import { useAuth } from '@/hooks/useAuth.ts';
import type { IMusicTrack } from '@/types/music.types.ts';
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
 * Список запрашивается после сессии; 401/403 на первом заходе повторяются один раз.
 * @returns Страница /admin/music
 */
export const AdminMusicPage: React.FC = () => {
    const { capabilities, isLoading, authStatus } = useAuth();
    const [tracks, setTracks] = useState<IMusicTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [credits, setCredits] = useState('');
    const [description, setDescription] = useState('');
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
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
            setTracks(await read());
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

            {error ? <p className={css.error} role="alert">{error}</p> : null}

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
                    Обложка
                    <span className={css.filePicker}>
                        <input
                            className={css.fileInput}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            aria-label="Обложка"
                            onChange={(event) => setCoverFile(event.target.files?.[0] ?? null)}
                        />
                        <span className={css.fileButton}>Выбрать обложку</span>
                        <span className={css.fileName}>{coverFile ? coverFile.name : 'необязательно'}</span>
                    </span>
                </label>
                <div className={css.formActions}>
                    <button type="submit" disabled={saving}>
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
                                <p className={css.cardCredits}>{track.credits}</p>
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
