/**
 * @file Библиотека музыки супер-админа: треки, альбомы и плейлисты отдельными списками.
 * Сервер пускает только super_admin; страница повторяет эту границу.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/AppHeader/AppHeader.tsx';
import {
    collectionCoverUrl,
    deleteCollection,
    deleteMusicTrack,
    fetchManageCollections,
    fetchManageTracks,
    fetchTrackBlob,
    publishCollection,
    publishMusicTrack,
    trackAudioUrl,
    trackCoverUrl,
    unpublishCollection,
    unpublishMusicTrack,
} from '@/api/music.api.ts';
import { CollectionSheet } from '@/pages/AdminMusicPage/CollectionSheet.tsx';
import { CollectionTracksSheet } from '@/pages/AdminMusicPage/CollectionTracksSheet.tsx';
import { TrackSheet } from '@/pages/AdminMusicPage/TrackSheet.tsx';
import {
    ListIcon,
    MusicNoteIcon,
    PencilIcon,
    PlayIcon,
    PlusIcon,
    PublishIcon,
    TrashIcon,
    UnpublishIcon,
} from '@/components/Icons/Icons.tsx';
import { TrackPlayer } from '@/components/TrackPlayer/TrackPlayer.tsx';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';
import { Loader } from '@/components/Loader/Loader.tsx';
import { useAuth } from '@/hooks/useAuth.ts';
import type { IMusicCollection, IMusicTrack } from '@/types/music.types.ts';
import css from './AdminMusicPage.module.css';

type LibraryTab = 'tracks' | 'albums' | 'playlists';
type SheetKind = 'track' | 'collection' | 'compose';

interface PlayerSource {
    src: string;
    title: string;
    credits: string;
    description: string | null;
    coverUrl: string | null;
    revoke?: boolean;
}

interface PendingAction {
    kind: 'track' | 'collection';
    id: string;
    action: 'unpublish' | 'delete';
    title: string;
}

/**
 * «1 запись», «2 записи», «5 записей».
 * @param count Число
 * @returns Подпись
 */
const countLabel = (count: number): string => {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) {
        return `${count} запись`;
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
        return `${count} записи`;
    }
    return `${count} записей`;
};

const ADD_LABEL: Record<LibraryTab, string> = {
    tracks: 'Новая запись',
    albums: 'Новый альбом',
    playlists: 'Новый плейлист',
};

const EMPTY_COPY: Record<LibraryTab, string> = {
    tracks: 'Пока нет записей.',
    albums: 'Пока нет альбомов.',
    playlists: 'Пока нет плейлистов.',
};

/**
 * Обложка 44px или нота, если файла нет.
 * @param props.src Адрес обложки
 * @returns Квадрат
 */
const Thumb: React.FC<{ src: string | null }> = ({ src }) => (
    src
        ? <img className={css.thumb} src={src} alt="" />
        : (
            <span className={css.thumb} aria-hidden="true">
                <MusicNoteIcon className={css.thumbIcon} />
            </span>
        )
);

/**
 * Точка черновика или эфира.
 * @param props.published Запись или подборка опубликована
 * @returns Метка
 */
const StatusMark: React.FC<{ published: boolean }> = ({ published }) => (
    <span className={published ? css.markOn : css.markOff}>
        {published ? 'В эфире' : 'Черновик'}
    </span>
);

/**
 * Списки библиотеки. Создание и правка открываются листом, на телефоне снизу.
 * Повтор 401/403 один раз: список запрашивается сразу после сессии.
 * @returns Страница /admin/music
 */
export const AdminMusicPage: React.FC = () => {
    const { capabilities, isLoading, authStatus } = useAuth();
    const [tracks, setTracks] = useState<IMusicTrack[]>([]);
    const [collections, setCollections] = useState<IMusicCollection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<LibraryTab>('tracks');
    const [sheet, setSheet] = useState<SheetKind | null>(null);
    const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
    const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
    const [player, setPlayer] = useState<PlayerSource | null>(null);
    const [playRequest, setPlayRequest] = useState(0);
    const [pending, setPending] = useState<PendingAction | null>(null);
    const errorRef = useRef<HTMLParagraphElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        const readTracks = async () => {
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
                readTracks(),
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

    const albums = collections.filter((collection) => collection.type === 'album');
    const playlists = collections.filter((collection) => collection.type === 'playlist');
    const editingTrack = tracks.find((track) => track.id === editingTrackId) ?? null;
    const editingCollection = collections.find((collection) => collection.id === editingCollectionId) ?? null;
    const sheetType = tab === 'playlists' ? 'playlist' : 'album';

    const closeSheet = () => {
        setSheet(null);
        setEditingTrackId(null);
        setEditingCollectionId(null);
    };

    const selectTab = (next: LibraryTab) => {
        setTab(next);
        closeSheet();
    };

    const openAdd = () => {
        setError(null);
        if (tab === 'tracks') {
            setEditingTrackId(null);
            setEditingCollectionId(null);
            setSheet('track');
            return;
        }
        setEditingTrackId(null);
        setEditingCollectionId(null);
        setSheet('collection');
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
            if (pending.kind === 'track') {
                if (pending.action === 'delete') {
                    await deleteMusicTrack(pending.id);
                } else {
                    await unpublishMusicTrack(pending.id);
                }
                if (editingTrackId === pending.id) {
                    closeSheet();
                }
            } else if (pending.action === 'delete') {
                await deleteCollection(pending.id);
                if (editingCollectionId === pending.id) {
                    closeSheet();
                }
            } else {
                await unpublishCollection(pending.id);
            }
            setPending(null);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось выполнить действие.');
        }
    };

    const publishCollectionNow = async (collection: IMusicCollection) => {
        setError(null);
        try {
            await publishCollection(collection.id);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось изменить публикацию.');
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

    const visibleCollections = tab === 'albums' ? albums : playlists;
    const listEmpty = tab === 'tracks' ? tracks.length === 0 : visibleCollections.length === 0;
    const confirmTitle = pending
        ? pending.action === 'delete'
            ? `Удалить «${pending.title}»?`
            : `Снять «${pending.title}» с публикации?`
        : '';
    const confirmBody = pending?.kind === 'collection'
        ? pending.action === 'delete'
            ? 'Подборка исчезнет. Записи останутся.'
            : 'Гости перестанут видеть подборку. Черновик останется у вас.'
        : pending?.action === 'delete'
            ? 'Файл и карточка исчезнут. Это нельзя отменить.'
            : 'Гости перестанут видеть запись. Черновик останется у вас.';

    return (
        <main className={css.page}>
            <AppHeader title="Музыка" backTo="/admin" backLabel="Назад">
                <button
                    type="button"
                    className={css.addButton}
                    aria-label={ADD_LABEL[tab]}
                    title={ADD_LABEL[tab]}
                    onClick={openAdd}
                >
                    <PlusIcon className={css.addIcon} />
                </button>
            </AppHeader>
            <div className={css.body}>
                <p className={css.lead}>
                    Черновик слышите вы. Гости увидят запись только после публикации.
                </p>
                <div className={css.tabs} role="tablist" aria-label="Разделы библиотеки">
                    {(['tracks', 'albums', 'playlists'] as const).map((item) => (
                        <button
                            key={item}
                            type="button"
                            role="tab"
                            className={css.tab}
                            aria-selected={tab === item}
                            onClick={() => selectTab(item)}
                        >
                            {item === 'tracks' ? 'Треки' : item === 'albums' ? 'Альбомы' : 'Плейлисты'}
                        </button>
                    ))}
                </div>

                {error && sheet === null ? <p ref={errorRef} className={css.error} role="alert">{error}</p> : null}

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
                ) : listEmpty ? (
                    <p className={css.empty}>{EMPTY_COPY[tab]}</p>
                ) : tab === 'tracks' ? (
                    <ul className={css.list}>
                        {tracks.map((track) => {
                            const published = track.status === 'published';
                            const meta = [track.credits, track.albumTitle].filter(Boolean).join(' · ');
                            return (
                                <li key={track.id} className={css.row}>
                                    <Thumb src={track.hasCover ? trackCoverUrl(track.id) : null} />
                                    <div className={css.rowMain}>
                                        <p className={css.rowTitle}>{track.title}</p>
                                        <p className={css.rowMeta}>
                                            {meta ? <span className={css.rowMetaText}>{meta}</span> : null}
                                            <StatusMark published={published} />
                                        </p>
                                    </div>
                                    <div className={css.rowActions}>
                                        <button
                                            type="button"
                                            className={css.play}
                                            aria-label={`Слушать ${track.title}`}
                                            title={`Слушать ${track.title}`}
                                            onClick={() => void listen(track)}
                                        >
                                            <PlayIcon className={css.rowIcon} />
                                        </button>
                                        {published ? (
                                            <button
                                                type="button"
                                                className={css.iconButton}
                                                aria-label={`Снять «${track.title}» с публикации`}
                                                title="Снять с публикации"
                                                onClick={() => setPending({ kind: 'track', id: track.id, action: 'unpublish', title: track.title })}
                                            >
                                                <UnpublishIcon className={css.rowIcon} />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className={css.iconButton}
                                                aria-label={`Опубликовать «${track.title}»`}
                                                title="Опубликовать"
                                                onClick={() => {
                                                    void publishMusicTrack(track.id)
                                                        .then(() => load())
                                                        .catch((err: unknown) => {
                                                            setError(err instanceof Error ? err.message : 'Не удалось опубликовать.');
                                                        });
                                                }}
                                            >
                                                <PublishIcon className={css.rowIcon} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className={css.iconButton}
                                            aria-label={`Изменить «${track.title}»`}
                                            title="Изменить"
                                            onClick={() => {
                                                setError(null);
                                                setEditingTrackId(track.id);
                                                setSheet('track');
                                            }}
                                        >
                                            <PencilIcon className={css.rowIcon} />
                                        </button>
                                        <button
                                            type="button"
                                            className={`${css.iconButton} ${css.danger}`}
                                            aria-label={`Удалить «${track.title}»`}
                                            title="Удалить"
                                            onClick={() => setPending({ kind: 'track', id: track.id, action: 'delete', title: track.title })}
                                        >
                                            <TrashIcon className={css.rowIcon} />
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                ) : (
                    <ul className={css.list}>
                        {visibleCollections.map((collection) => {
                            const published = collection.status === 'published';
                            return (
                                <li key={collection.id} className={css.row}>
                                    <Thumb src={collection.hasCover ? collectionCoverUrl(collection.id) : null} />
                                    <div className={css.rowMain}>
                                        <p className={css.rowTitle}>{collection.title}</p>
                                        <p className={css.rowMeta}>
                                            <span className={css.rowMetaText}>{countLabel(collection.trackCount)}</span>
                                            <StatusMark published={published} />
                                        </p>
                                    </div>
                                    <div className={css.rowActions}>
                                        {published ? (
                                            <button
                                                type="button"
                                                className={css.iconButton}
                                                aria-label={`Снять «${collection.title}» с публикации`}
                                                title="Снять с публикации"
                                                onClick={() => setPending({
                                                    kind: 'collection',
                                                    id: collection.id,
                                                    action: 'unpublish',
                                                    title: collection.title,
                                                })}
                                            >
                                                <UnpublishIcon className={css.rowIcon} />
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className={css.iconButton}
                                                aria-label={`Опубликовать «${collection.title}»`}
                                                title="Опубликовать"
                                                onClick={() => void publishCollectionNow(collection)}
                                            >
                                                <PublishIcon className={css.rowIcon} />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className={css.iconButton}
                                            aria-label={`Изменить «${collection.title}»`}
                                            title="Изменить"
                                            onClick={() => {
                                                setError(null);
                                                setEditingCollectionId(collection.id);
                                                setSheet('collection');
                                            }}
                                        >
                                            <PencilIcon className={css.rowIcon} />
                                        </button>
                                        <button
                                            type="button"
                                            className={css.iconButton}
                                            aria-label={`Состав: ${collection.title}`}
                                            title="Состав"
                                            onClick={() => {
                                                setError(null);
                                                setEditingCollectionId(collection.id);
                                                setSheet('compose');
                                            }}
                                        >
                                            <ListIcon className={css.rowIcon} />
                                        </button>
                                        <button
                                            type="button"
                                            className={`${css.iconButton} ${css.danger}`}
                                            aria-label={`Удалить «${collection.title}»`}
                                            title="Удалить"
                                            onClick={() => setPending({
                                                kind: 'collection',
                                                id: collection.id,
                                                action: 'delete',
                                                title: collection.title,
                                            })}
                                        >
                                            <TrashIcon className={css.rowIcon} />
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <ModalPopup
                isOpen={sheet === 'track'}
                onClose={closeSheet}
                title={editingTrackId ? 'Правка' : 'Новая запись'}
            >
                <TrackSheet
                    key={editingTrackId ?? 'new'}
                    editingId={editingTrackId}
                    initial={{
                        title: editingTrack?.title ?? '',
                        credits: editingTrack?.credits ?? '',
                        description: editingTrack?.description ?? '',
                        albumId: editingTrack?.albumId ?? '',
                    }}
                    albums={albums}
                    error={error}
                    onError={setError}
                    onPreview={setPlayer}
                    onDone={() => {
                        closeSheet();
                        setPlayer(null);
                        void load();
                    }}
                    onCancel={closeSheet}
                />
            </ModalPopup>

            <ModalPopup
                isOpen={sheet === 'collection'}
                onClose={closeSheet}
                title={editingCollection
                    ? (editingCollection.type === 'album' ? 'Правка альбома' : 'Правка плейлиста')
                    : ADD_LABEL[tab === 'tracks' ? 'albums' : tab]}
            >
                <CollectionSheet
                    key={editingCollectionId ?? `new-${sheetType}`}
                    type={editingCollection?.type ?? sheetType}
                    collection={editingCollection}
                    error={error}
                    onError={setError}
                    onDone={() => {
                        closeSheet();
                        void load();
                    }}
                />
            </ModalPopup>

            <ModalPopup
                isOpen={sheet === 'compose' && editingCollection !== null}
                onClose={closeSheet}
                title={editingCollection ? `Состав «${editingCollection.title}»` : 'Состав'}
            >
                {editingCollection ? (
                    <CollectionTracksSheet
                        collection={editingCollection}
                        tracks={tracks}
                        error={error}
                        onReload={() => void load()}
                        onError={setError}
                    />
                ) : null}
            </ModalPopup>

            <ModalPopup isOpen={pending !== null} onClose={() => setPending(null)} title={confirmTitle}>
                {pending ? (
                    <>
                        <p>{confirmBody}</p>
                        <div className={css.formActions}>
                            <button type="button" className={css.quiet} onClick={() => setPending(null)}>
                                Отмена
                            </button>
                            <button type="button" className={css.confirmDanger} onClick={() => void confirmPending()}>
                                {pending.action === 'delete' ? 'Удалить' : 'Снять'}
                            </button>
                        </div>
                    </>
                ) : null}
            </ModalPopup>
        </main>
    );
};
