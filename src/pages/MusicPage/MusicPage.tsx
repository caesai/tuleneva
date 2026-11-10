/**
 * @file Каталог музыки и страница одной записи.
 * Синглы — опубликованные записи, которых нет ни в одном опубликованном альбоме или плейлисте.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
    collectionCoverUrl,
    fetchCollection,
    fetchMusicCatalog,
    fetchPublishedTrack,
    trackAudioUrl,
    trackCoverUrl,
} from '@/api/music.api.ts';
import { TrackPlayer } from '@/components/TrackPlayer/TrackPlayer.tsx';
import { Loader } from '@/components/Loader/Loader.tsx';
import { MUSIC_PAGE_META, type IPageMeta } from '@/config/siteMeta.ts';
import { usePageMeta } from '@/hooks/usePageMeta.ts';
import type { IMusicCatalog, IMusicCollection, IMusicTrack } from '@/types/music.types.ts';
import { MusicHeader } from './MusicHeader.tsx';
import { TrackRows } from './TrackRows.tsx';
import css from './MusicPage.module.css';

/**
 * «1 запись», «2 записи», «5 записей».
 * @param count Число
 * @returns Подпись
 */
const trackCountLabel = (count: number): string => {
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

/**
 * Подпись типа на карточке.
 * @param type album или playlist
 * @returns Альбом или Плейлист
 */
const typeLabel = (type: IMusicCollection['type']): string => (
    type === 'album' ? 'Альбом' : 'Плейлист'
);

/**
 * Сетка обложек или одна запись по старой ссылке /music/:trackId.
 * @returns Страница
 */
export const MusicPage: React.FC = () => {
    const { trackId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const playOnOpen = Boolean((location.state as { play?: boolean } | null)?.play);
    const [catalog, setCatalog] = useState<IMusicCatalog>({ collections: [], singles: [] });
    const [track, setTrack] = useState<IMusicTrack | null>(null);
    const [album, setAlbum] = useState<IMusicCollection | null>(null);
    const [missing, setMissing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [playRequest, setPlayRequest] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setMissing(false);
        const run = async () => {
            if (!trackId) {
                const next = await fetchMusicCatalog();
                if (!cancelled) {
                    setCatalog(next);
                    setTrack(null);
                    setAlbum(null);
                }
                return;
            }
            const nextTrack = await fetchPublishedTrack(trackId);
            if (cancelled) {
                return;
            }
            if (!nextTrack) {
                setTrack(null);
                setAlbum(null);
                setMissing(true);
                return;
            }
            setTrack(nextTrack);
            if (nextTrack.albumId) {
                try {
                    const nextAlbum = await fetchCollection(nextTrack.albumId);
                    if (!cancelled) {
                        setAlbum(nextAlbum.type === 'album' ? nextAlbum : null);
                    }
                } catch {
                    if (!cancelled) {
                        setAlbum(null);
                    }
                }
            } else if (!cancelled) {
                setAlbum(null);
            }
        };
        run()
            .catch((err: unknown) => {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Не удалось загрузить музыку.');
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
    }, [reloadKey, trackId]);

    useEffect(() => {
        if (playOnOpen && track && track.id === trackId) {
            setPlayRequest((value) => value + 1);
        }
    }, [playOnOpen, track, trackId]);

    const pageMeta = useMemo<IPageMeta>(() => {
        if (!track) {
            return MUSIC_PAGE_META;
        }
        return {
            ...MUSIC_PAGE_META,
            title: `${track.title} — Тюленева 25`,
            description: track.description || `${track.title}. ${track.credits}`,
            canonicalPath: `/music/${track.id}`,
            ogType: 'music.song',
            ogImagePath: track.hasCover ? trackCoverUrl(track.id) : MUSIC_PAGE_META.ogImagePath,
            ogImageAlt: track.title,
        };
    }, [track]);
    usePageMeta(pageMeta);

    const order = album?.tracks ?? [];
    const selectedIndex = order.findIndex((item) => item.id === track?.id);

    /**
     * Открывает запись. play — сразу просит плеер стартовать.
     * @param id Идентификатор
     * @param play Начать воспроизведение
     */
    const openTrack = (id: string, play: boolean) => {
        navigate(`/music/${id}`, play ? { state: { play: true } } : undefined);
    };

    const quiet = catalog.collections.length === 0 && catalog.singles.length === 0;

    return (
        <main className={css.page}>
            <MusicHeader heading={!trackId} />
            {trackId ? (
                <p className={css.back}>
                    <Link to="/music">Вся музыка</Link>
                </p>
            ) : null}

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

            {!loading && !error && !trackId && quiet ? (
                <p className={css.empty}>Пока здесь тихо. Записи появятся, когда студия их опубликует.</p>
            ) : null}

            {!loading && !error && !trackId && catalog.collections.length > 0 ? (
                <ul className={css.grid}>
                    {catalog.collections.map((collection) => (
                        <li key={collection.id}>
                            <Link
                                className={css.coverCard}
                                to={`/music/${collection.type === 'album' ? 'album' : 'playlist'}/${collection.id}`}
                            >
                                {collection.hasCover ? (
                                    <img
                                        className={css.cover}
                                        src={collectionCoverUrl(collection.id)}
                                        alt=""
                                    />
                                ) : (
                                    <span className={css.coverEmpty} aria-hidden="true" />
                                )}
                                <span className={css.coverTitle}>{collection.title}</span>
                                <span className={css.coverMeta}>
                                    {typeLabel(collection.type)}
                                    {' · '}
                                    {trackCountLabel(collection.trackCount)}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            ) : null}

            {!loading && !error && !trackId && catalog.singles.length > 0 ? (
                <section className={css.singles}>
                    <h2 className={css.sectionTitle}>Синглы</h2>
                    <TrackRows
                        tracks={catalog.singles}
                        playing={false}
                        onSelect={(id) => openTrack(id, false)}
                        onPress={(id) => openTrack(id, true)}
                    />
                </section>
            ) : null}

            {missing && !loading ? (
                <p className={css.empty} role="status">Запись не найдена или ещё не опубликована.</p>
            ) : null}

            {track ? (
                <>
                    <h1 className={css.title}>{track.title}</h1>
                    {album ? (
                        <p className={css.back}>
                            <Link to={`/music/album/${album.id}`}>{`Альбом «${album.title}»`}</Link>
                        </p>
                    ) : null}
                    <TrackPlayer
                        title={track.title}
                        credits={track.credits}
                        description={track.description}
                        coverUrl={track.hasCover ? trackCoverUrl(track.id) : null}
                        src={trackAudioUrl(track.id)}
                        playRequest={playRequest}
                        hasPrevious={selectedIndex > 0}
                        hasNext={selectedIndex >= 0 && selectedIndex < order.length - 1}
                        onPrevious={() => openTrack(order[selectedIndex - 1].id, true)}
                        onNext={() => openTrack(order[selectedIndex + 1].id, true)}
                    />
                </>
            ) : null}
        </main>
    );
};
