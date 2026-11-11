/**
 * @file Форма черновика и правки записи. Открывается листом снизу на телефоне.
 */
import React, { useRef, useState } from 'react';
import { createCollection, createMusicDraft, updateMusicTrack } from '@/api/music.api.ts';
import { prepareCoverFile } from '@/music/prepareCover.ts';
import type { IMusicCollection } from '@/types/music.types.ts';
import css from './AdminMusicPage.module.css';

interface TrackInitial {
    title: string;
    credits: string;
    description: string;
    albumId: string;
}

interface PreviewSource {
    src: string;
    title: string;
    credits: string;
    description: string | null;
    coverUrl: string | null;
    revoke?: boolean;
}

interface TrackSheetProps {
    /** null — новая запись. */
    editingId: string | null;
    /** Поля на момент открытия. */
    initial: TrackInitial;
    /** Альбомы для выбора, включая черновики. */
    albums: IMusicCollection[];
    /** Текст ошибки страницы, чтобы не дублировать alert. */
    error: string | null;
    /** Сообщить ошибку на страницу. */
    onError: (message: string | null) => void;
    /** Локальный файл в плеер, без автозапуска. */
    onPreview: (source: PreviewSource) => void;
    /** После успешного сохранения. */
    onDone: () => void;
    /** Закрыть без сохранения. */
    onCancel: () => void;
}

/**
 * Название, кто играет, MP3, альбом и обложка.
 * Новый альбом создаётся здесь же, до сохранения записи.
 * @param props Режим правки и колбэки
 * @returns Форма
 */
export const TrackSheet: React.FC<TrackSheetProps> = ({
    editingId,
    initial,
    albums,
    error,
    onError,
    onPreview,
    onDone,
    onCancel,
}) => {
    const [title, setTitle] = useState(initial.title);
    const [credits, setCredits] = useState(initial.credits);
    const [description, setDescription] = useState(initial.description);
    const [albumChoice, setAlbumChoice] = useState(initial.albumId);
    const [newAlbumTitle, setNewAlbumTitle] = useState('');
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverBusy, setCoverBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const coverInputRef = useRef<HTMLInputElement>(null);

    const previewFile = (file: File | null) => {
        setAudioFile(file);
        if (!file) {
            return;
        }
        onPreview({
            src: URL.createObjectURL(file),
            title: title || file.name,
            credits: credits || 'Предпросмотр',
            description: description || null,
            coverUrl: coverFile ? URL.createObjectURL(coverFile) : null,
            revoke: true,
        });
    };

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

    const onSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!editingId && !audioFile) {
            onError('Выберите MP3.');
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
                onError('Название альбома нужно.');
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
                onError(err instanceof Error ? err.message : 'Не удалось создать альбом.');
                return;
            }
        }
        if (albumId) {
            body.set('albumId', albumId);
        } else if (editingId) {
            body.set('albumId', '');
        }
        setSaving(true);
        onError(null);
        try {
            if (editingId) {
                await updateMusicTrack(editingId, body);
            } else {
                await createMusicDraft(body);
            }
            onDone();
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Не удалось сохранить.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className={css.form} onSubmit={onSubmit}>
            {error ? <p className={css.error} role="alert">{error}</p> : null}
            <label className={css.field}>
                Название
                <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={120} />
            </label>
            <label className={css.field}>
                Кто играет
                <input value={credits} onChange={(event) => setCredits(event.target.value)} required maxLength={160} />
            </label>
            <label className={css.field}>
                Описание
                <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={500}
                    rows={3}
                />
            </label>
            <label className={css.field}>
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
            <label className={css.field}>
                Альбом
                <select
                    aria-label="Альбом"
                    value={albumChoice}
                    onChange={(event) => setAlbumChoice(event.target.value)}
                >
                    <option value="">Без альбома</option>
                    {albums.map((album) => (
                        <option key={album.id} value={album.id}>{album.title}</option>
                    ))}
                    <option value="__new__">Новый альбом…</option>
                </select>
            </label>
            {albumChoice === '__new__' ? (
                <label className={css.field}>
                    Название альбома
                    <input
                        aria-label="Название альбома"
                        value={newAlbumTitle}
                        onChange={(event) => setNewAlbumTitle(event.target.value)}
                        maxLength={120}
                    />
                </label>
            ) : null}
            <label className={css.field}>
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
                {editingId ? (
                    <button type="button" className={css.quiet} onClick={onCancel}>
                        Отмена
                    </button>
                ) : null}
                <button className={css.submit} type="submit" disabled={saving || coverBusy}>
                    {saving ? 'Сохранение…' : editingId ? 'Сохранить' : 'Сохранить черновик'}
                </button>
            </div>
        </form>
    );
};
