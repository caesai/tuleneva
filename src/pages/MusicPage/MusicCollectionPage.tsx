/**
 * @file Страница альбома или плейлиста: обложка, текст и плеер по порядку подборки.
 * Конец записи включает следующую в этом порядке и останавливается на последней.
 * Назад и «Поделиться» живут в общей липкой шапке.
 * Прослушивание и шаринг пишут анонимную статистику с меткой источника.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
    collectionCoverUrl,
    fetchCollection,
    trackAudioUrl,
    trackCoverUrl,
} from '@/api/music.api.ts';
import { TrackPlayer } from '@/components/TrackPlayer/TrackPlayer.tsx';
import { Loader } from '@/components/Loader/Loader.tsx';
import { MUSIC_PAGE_META, toAbsoluteUrl, type IPageMeta } from '@/config/siteMeta.ts';
import { usePageMeta } from '@/hooks/usePageMeta.ts';
import { captureListenSource, type ListenTarget } from '@/music/listenStats.ts';
import type { IMusicCollection } from '@/types/music.types.ts';
import { AppHeader } from '@/components/AppHeader/AppHeader.tsx';
import { MusicNoteIcon } from '@/components/Icons/Icons.tsx';
import { SharePageButton } from './SharePageButton.tsx';
import { TrackRows } from './TrackRows.tsx';
import css from './MusicPage.module.css';

/**
 * Большая обложка и записи. Previous и next идут по порядку подборки.
 * @returns Страница /music/album/:id или /music/playlist/:id
 */
export const MusicCollectionPage: React.FC = () => {
    const { id } = useParams();
    const location = useLocation();

    useEffect(() => {
        captureListenSource(location.search);
    }, [location.search]);
    const [collection, setCollection] = useState<IMusicCollection | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [trackId, setTrackId] = useState<string | null>(null);
    const [playRequest, setPlayRequest] = useState(0);
    const [pauseRequest, setPauseRequest] = useState(0);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setCollection(null);
        setTrackId(null);
        if (!id) {
            setLoading(false);
            setError('Подборка не найдена или ещё не опубликована.');
            return undefined;
        }
        fetchCollection(id)
            .then((next) => {
                if (!cancelled) {
                    setCollection(next);
                }
            })
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Не удалось загрузить подборку.');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [id, reloadKey]);

    const tracks = collection?.tracks ?? [];
    const selected = tracks.find((track) => track.id === trackId) ?? null;
    const selectedIndex = tracks.findIndex((track) => track.id === trackId);
    const nextTrack = selectedIndex >= 0 && selectedIndex < tracks.length - 1
        ? tracks[selectedIndex + 1]
        : null;
    const kindLabel = collection?.type === 'playlist' ? 'Плейлист' : 'Альбом';

    /**
     * Контекст статистики для записи внутри этой подборки.
     * @param item Запись
     * @returns Цель события
     */
    const listenTarget = useCallback((item: { id: string; albumId?: string | null }): ListenTarget => ({
        trackId: item.id,
        albumId: collection?.type === 'album' ? collection.id : item.albumId ?? null,
        playlistId: collection?.type === 'playlist' ? collection.id : null,
    }), [collection]);

    const pageMeta = useMemo<IPageMeta>(() => {
        if (!collection) {
            return MUSIC_PAGE_META;
        }
        const path = `/music/${collection.type === 'album' ? 'album' : 'playlist'}/${collection.id}`;
        const imagePath = collection.hasCover
            ? collectionCoverUrl(collection.id, collection.coverVersion)
            : MUSIC_PAGE_META.ogImagePath;
        return {
            ...MUSIC_PAGE_META,
            title: `${collection.title} — Тюленева 25`,
            description: collection.description || `${kindLabel} «${collection.title}»`,
            canonicalPath: path,
            ogType: collection.type === 'album' ? 'music.album' : 'music.playlist',
            ogImagePath: imagePath,
            ogImageAlt: collection.title,
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': collection.type === 'album' ? 'MusicAlbum' : 'MusicPlaylist',
                name: collection.title,
                description: collection.description || undefined,
                url: toAbsoluteUrl(path),
                numTracks: collection.trackCount,
                ...(collection.hasCover
                    ? { image: toAbsoluteUrl(collectionCoverUrl(collection.id, collection.coverVersion)) }
                    : {}),
            },
        };
    }, [collection, kindLabel]);
    usePageMeta(pageMeta);

    /**
     * Выбирает запись и просит плеер стартовать.
     * @param nextId Идентификатор
     */
    const playTrack = useCallback((nextId: string) => {
        setTrackId(nextId);
        setPlayRequest((value) => value + 1);
    }, []);

    const advanceTrack = useCallback(() => {
        if (nextTrack) {
            setTrackId(nextTrack.id);
        }
    }, [nextTrack]);

    /**
     * Пауза, если эта запись уже звучит.
     * @param nextId Идентификатор
     */
    const pressRow = (nextId: string) => {
        if (nextId === trackId && playing) {
            setPauseRequest((value) => value + 1);
            return;
        }
        playTrack(nextId);
    };

    return (
        <main className={css.shell}>
            <AppHeader title="Музыка" backTo="/music" backLabel="Вся музыка">
                {collection ? (
                    <SharePageButton
                        title={`${collection.title} — Тюленева 25`}
                        url={toAbsoluteUrl(
                            `/music/${collection.type === 'album' ? 'album' : 'playlist'}/${collection.id}`,
                        )}
                        albumId={collection.type === 'album' ? collection.id : null}
                        playlistId={collection.type === 'playlist' ? collection.id : null}
                    />
                ) : null}
            </AppHeader>
            <div className={css.page}>

            {loading ? (
                <div className={css.status} aria-busy="true" aria-label="Загрузка музыки">
                    <Loader fullScreen={false} />
                </div>
            ) : null}

            {error ? (
                <div className={css.status} role="alert">
                    <p>{error}</p>
                    <button type="button" className={css.retry} onClick={() => setReloadKey((value) => value + 1)}>
                        Повторить
                    </button>
                </div>
            ) : null}

            {collection ? (
                <>
                    {collection.hasCover ? (
                        <img
                            className={css.heroCover}
                            src={collectionCoverUrl(collection.id, collection.coverVersion)}
                            alt={`Обложка «${collection.title}»`}
                        />
                    ) : (
                        <span className={css.heroCoverEmpty} aria-hidden="true">
                            <MusicNoteIcon className={css.placeholderIcon} />
                        </span>
                    )}
                    <p className={css.kicker}>{kindLabel}</p>
                    <h1 className={css.title}>{collection.title}</h1>
                    {collection.description ? <p className={css.lead}>{collection.description}</p> : null}
                    {tracks.length === 0 ? (
                        <p className={css.empty}>В этой подборке пока нет опубликованных записей.</p>
                    ) : (
                        <TrackRows
                            tracks={tracks}
                            currentId={trackId}
                            playing={playing}
                            fallbackCoverUrl={collection.hasCover ? collectionCoverUrl(collection.id, collection.coverVersion) : null}
                            onSelect={setTrackId}
                            onPress={pressRow}
                        />
                    )}
                    {selected ? (
                        <TrackPlayer
                            title={selected.title}
                            credits={selected.credits}
                            description={selected.description}
                            coverUrl={selected.hasCover ? trackCoverUrl(selected.id, selected.coverVersion) : null}
                            src={trackAudioUrl(selected.id, selected.audioVersion)}
                            playRequest={playRequest}
                            pauseRequest={pauseRequest}
                            hasPrevious={selectedIndex > 0}
                            hasNext={nextTrack !== null}
                            autoAdvance
                            nextSrc={nextTrack ? trackAudioUrl(nextTrack.id, nextTrack.audioVersion) : null}
                            nextListen={nextTrack ? listenTarget(nextTrack) : null}
                            onPlayingChange={setPlaying}
                            onPrevious={() => playTrack(tracks[selectedIndex - 1].id)}
                            onNext={() => playTrack(tracks[selectedIndex + 1].id)}
                            onAutoAdvance={advanceTrack}
                            listen={listenTarget(selected)}
                        />
                    ) : null}
                </>
            ) : null}
            </div>
        </main>
    );
};
