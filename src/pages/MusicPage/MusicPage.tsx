/**
 * @file Публичная страница музыки. Вход не нужен, автозапуска нет.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchPublishedTracks, trackAudioUrl, trackCoverUrl } from '@/api/music.api.ts';
import { TrackPlayer } from '@/components/TrackPlayer/TrackPlayer.tsx';
import { Loader } from '@/components/Loader/Loader.tsx';
import { MUSIC_PAGE_META, type IPageMeta } from '@/config/siteMeta.ts';
import { usePageMeta } from '@/hooks/usePageMeta.ts';
import type { IMusicTrack } from '@/types/music.types.ts';
import css from './MusicPage.module.css';

/**
 * Каталог записей студии и одна панель плеера.
 * @returns Страница /music и /music/:trackId
 */
export const MusicPage: React.FC = () => {
    const { trackId } = useParams();
    const navigate = useNavigate();
    const [tracks, setTracks] = useState<IMusicTrack[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [playRequest, setPlayRequest] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchPublishedTracks()
            .then((list) => {
                if (!cancelled) {
                    setTracks(list);
                }
            })
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
    }, [reloadKey]);

    const selected = tracks.find((track) => track.id === trackId) ?? null;
    const pageMeta = useMemo<IPageMeta>(() => {
        if (!selected) {
            return MUSIC_PAGE_META;
        }
        return {
            ...MUSIC_PAGE_META,
            title: `${selected.title} — Тюленева 25`,
            description: selected.description || `${selected.title}. ${selected.credits}`,
            canonicalPath: `/music/${selected.id}`,
        };
    }, [selected]);
    usePageMeta(pageMeta);

    /**
     * Открывает запись в адресе, не начиная воспроизведение.
     * @param id Идентификатор
     */
    const selectTrack = (id: string) => {
        navigate(`/music/${id}`);
    };

    /**
     * Жест пользователя: выбрать запись и попросить плеер стартовать.
     * @param id Идентификатор
     */
    const playTrack = (id: string) => {
        navigate(`/music/${id}`);
        setPlayRequest((value) => value + 1);
    };

    return (
        <main className={css.page}>
            <header className={css.header}>
                <Link to="/" className={css.brand}>
                    <img src="/logo_main512.svg" alt="" width={36} height={36} />
                    <span>Тюленева 25</span>
                </Link>
                <nav className={css.nav} aria-label="Разделы студии">
                    <Link to="/app">Расписание</Link>
                </nav>
            </header>
            <h1 className={css.title}>Музыка</h1>
            <p className={css.lead}>
                Записи студии. Слушать можно без входа. Включается только то, что вы нажмёте.
            </p>

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

            {!loading && !error && tracks.length === 0 ? (
                <p className={css.empty}>Пока здесь тихо. Записи появятся, когда студия их опубликует.</p>
            ) : null}

            {tracks.length > 0 ? (
                <ul className={css.list}>
                    {tracks.map((track) => {
                        const current = track.id === trackId;
                        return (
                            <li key={track.id} className={current ? css.itemCurrent : css.item}>
                                <button
                                    type="button"
                                    className={css.itemMain}
                                    onClick={() => selectTrack(track.id)}
                                    aria-current={current ? 'true' : undefined}
                                >
                                    {track.hasCover ? (
                                        <img
                                            className={css.thumb}
                                            src={trackCoverUrl(track.id)}
                                            alt=""
                                        />
                                    ) : (
                                        <span className={css.thumbEmpty} aria-hidden="true" />
                                    )}
                                    <span className={css.itemText}>
                                        <span className={css.itemTitle}>{track.title}</span>
                                        <span className={css.itemCredits}>{track.credits}</span>
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    className={css.rowPlay}
                                    onClick={() => playTrack(track.id)}
                                    aria-label={`Слушать: ${track.title}`}
                                >
                                    Слушать
                                </button>
                                <Link className={css.share} to={`/music/${track.id}`}>
                                    Ссылка
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            ) : null}

            {trackId && !loading && !selected ? (
                <p className={css.empty} role="status">Запись не найдена или ещё не опубликована.</p>
            ) : null}

            {selected ? (
                <TrackPlayer
                    title={selected.title}
                    credits={selected.credits}
                    description={selected.description}
                    coverUrl={selected.hasCover ? trackCoverUrl(selected.id) : null}
                    src={trackAudioUrl(selected.id)}
                    playRequest={playRequest}
                />
            ) : null}
        </main>
    );
};
