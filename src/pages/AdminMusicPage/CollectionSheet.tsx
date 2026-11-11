/**
 * @file Создание и правка альбома или плейлиста: название, описание, обложка.
 */
import React, { useRef, useState } from 'react';
import { createCollection, updateCollection } from '@/api/music.api.ts';
import { prepareCoverFile } from '@/music/prepareCover.ts';
import type { IMusicCollection, TMusicCollectionType } from '@/types/music.types.ts';
import css from './AdminMusicPage.module.css';

interface CollectionSheetProps {
    /** album или playlist. При правке берётся из подборки. */
    type: TMusicCollectionType;
    /** Есть — правка, нет — создание. */
    collection: IMusicCollection | null;
    /** Текст ошибки страницы. */
    error: string | null;
    /** Сообщить ошибку на страницу. */
    onError: (message: string | null) => void;
    /** После успешного сохранения. */
    onDone: () => void;
}

/**
 * Тот же контракт, что у прежней формы подборки, без выбора типа:
 * тип задаёт вкладка.
 * @param props Тип, подборка и колбэки
 * @returns Форма
 */
export const CollectionSheet: React.FC<CollectionSheetProps> = ({
    type,
    collection,
    error,
    onError,
    onDone,
}) => {
    const [title, setTitle] = useState(collection?.title ?? '');
    const [description, setDescription] = useState(collection?.description ?? '');
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverBusy, setCoverBusy] = useState(false);
    const [saving, setSaving] = useState(false);
    const coverInputRef = useRef<HTMLInputElement>(null);
    const kind = type === 'album' ? 'альбом' : 'плейлист';

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
        setSaving(true);
        onError(null);
        try {
            const trimmedTitle = title.trim();
            const trimmedDescription = description.trim();
            if (collection) {
                const body = new FormData();
                body.set('title', trimmedTitle);
                body.set('description', trimmedDescription);
                if (coverFile) {
                    body.set('cover', coverFile);
                }
                await updateCollection(collection.id, body);
            } else {
                const created = await createCollection({
                    type,
                    title: trimmedTitle,
                    description: trimmedDescription,
                });
                if (coverFile) {
                    const body = new FormData();
                    body.set('title', trimmedTitle);
                    body.set('description', trimmedDescription);
                    body.set('cover', coverFile);
                    await updateCollection(created.id, body);
                }
            }
            onDone();
        } catch (err) {
            onError(err instanceof Error ? err.message : 'Не удалось сохранить подборку.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className={css.form} onSubmit={onSubmit}>
            {error ? <p className={css.error} role="alert">{error}</p> : null}
            <label className={css.field}>
                Название подборки
                <input
                    aria-label={collection ? 'Правка названия' : 'Название подборки'}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    required
                    maxLength={120}
                />
            </label>
            <label className={css.field}>
                Описание подборки
                <textarea
                    aria-label={collection ? 'Правка описания' : 'Описание подборки'}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={500}
                    rows={3}
                />
            </label>
            <label className={css.field}>
                {collection ? 'Новая обложка' : 'Обложка подборки'}
                <span className={css.filePicker}>
                    <input
                        ref={coverInputRef}
                        className={css.fileInput}
                        type="file"
                        accept="image/*,.heic,.heif"
                        aria-label={collection ? 'Новая обложка подборки' : 'Обложка подборки'}
                        onChange={(event) => void onCoverPicked(event.target.files?.[0] ?? null)}
                    />
                    <span className={css.fileButton}>Выбрать обложку</span>
                    <span className={css.fileName}>
                        {coverBusy ? 'Сжимаем фото…' : coverFile ? coverFile.name : collection ? 'не менять' : 'необязательно'}
                    </span>
                </span>
            </label>
            <div className={css.formActions}>
                <button className={css.submit} type="submit" disabled={saving || coverBusy}>
                    {saving ? 'Сохранение…' : collection ? 'Сохранить подборку' : `Создать ${kind}`}
                </button>
            </div>
        </form>
    );
};
