/**
 * @file Приём анонимных событий /music и сводка для супер-админа.
 * Лимит частоты помнит IP только в памяти процесса. В коллекцию адрес не попадает.
 */
import type { Request, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import {
    MUSIC_EVENT_DEDUPE_MS,
    MUSIC_STATS_DAYS,
    MUSIC_STATS_TOP,
    type MusicEventType,
    sanitizeMusicSource,
} from '../../shared/musicListen';
import {
    MusicEventRequestSchema,
    MusicEventResponseSchema,
    MusicStatsResponseSchema,
} from '../../shared/contracts/music';
import MusicCollection from '../models/MusicCollection';
import MusicEvent from '../models/MusicEvent';
import MusicTrack from '../models/MusicTrack';

const STATS_WINDOW_MS = MUSIC_STATS_DAYS * 24 * 60 * 60 * 1000;

/** Счётчики одной цели. */
interface ItemStats {
    plays7d: number;
    playsAll: number;
    completes7d: number;
    completesAll: number;
}

/** Строка агрегации по id записи или подборки. */
interface CountRow {
    _id: string | null;
    plays7d: number;
    playsAll: number;
    completes7d: number;
    completesAll: number;
}

/**
 * Приводит id к нижнему регистру или к null.
 * @param value Поле тела
 * @returns Id или null
 */
const cleanId = (value: string | null | undefined): string | null => {
    if (!value) {
        return null;
    }
    return value.toLowerCase();
};

/**
 * Проверяет, что переданные id — опубликованные сущности нужного вида.
 * Лишний или черновой id отклоняет всё событие, чтобы в сводку не попадал мусор.
 * @param type Событие
 * @param trackId Запись или null
 * @param albumId Альбом или null
 * @param playlistId Плейлист или null
 * @returns Цели, которые можно писать, или null
 */
const publishedTarget = async (
    type: MusicEventType,
    trackId: string | null,
    albumId: string | null,
    playlistId: string | null,
): Promise<{ trackId: string | null; albumId: string | null; playlistId: string | null } | null> => {
    const [track, album, playlist] = await Promise.all([
        trackId && mongoose.Types.ObjectId.isValid(trackId) ? MusicTrack.findById(trackId) : null,
        albumId && mongoose.Types.ObjectId.isValid(albumId) ? MusicCollection.findById(albumId) : null,
        playlistId && mongoose.Types.ObjectId.isValid(playlistId) ? MusicCollection.findById(playlistId) : null,
    ]);
    const trackOk = Boolean(track && track.status === 'published');
    const albumOk = Boolean(album && album.type === 'album' && album.status === 'published');
    const playlistOk = Boolean(playlist && playlist.type === 'playlist' && playlist.status === 'published');
    if (trackId && !trackOk) {
        return null;
    }
    if (albumId && !albumOk) {
        return null;
    }
    if (playlistId && !playlistOk) {
        return null;
    }
    if (type === 'share') {
        if (!trackOk && !albumOk && !playlistOk) {
            return null;
        }
    } else if (!trackOk || !trackId) {
        return null;
    }
    return {
        trackId: trackOk ? trackId : null,
        albumId: albumOk ? albumId : null,
        playlistId: playlistOk ? playlistId : null,
    };
};

/**
 * Повтор внутри окна не пишем. Прослушивание схлопывается по записи,
 * шаринг — по всему набору целей.
 * @param type Событие
 * @param sessionId Анонимная сессия
 * @param target Уже проверенные id
 * @returns true, если такое событие уже есть
 */
const isDuplicate = async (
    type: MusicEventType,
    sessionId: string,
    target: { trackId: string | null; albumId: string | null; playlistId: string | null },
): Promise<boolean> => {
    const since = new Date(Date.now() - MUSIC_EVENT_DEDUPE_MS);
    const filter: Record<string, unknown> = {
        sessionId,
        type,
        createdAt: { $gte: since },
        trackId: target.trackId,
    };
    if (type === 'share') {
        filter.albumId = target.albumId;
        filter.playlistId = target.playlistId;
    }
    return Boolean(await MusicEvent.exists(filter));
};

/**
 * sendBeacon шлёт строку как text/plain. Глобальный json-парсер её не читает.
 * @param req Запрос
 * @param res Ответ
 * @param next Дальше, когда тело — объект
 */
export const parsePlainMusicEvent: RequestHandler = (req, res, next) => {
    if (typeof req.body !== 'string') {
        next();
        return;
    }
    try {
        req.body = req.body ? JSON.parse(req.body) : {};
    } catch {
        res.status(400).json({ message: 'Некорректное событие.' });
        return;
    }
    next();
};

/**
 * Пишет одно событие или отвечает, что это повтор.
 * @route POST /api/music/events
 * @param req Тело события и, по желанию, JWT участника
 * @param res 200 записали или схлопнули, 400 тело, 404 нет опубликованной цели
 */
export const postMusicEvent = async (req: Request, res: Response): Promise<void> => {
    const parsed = MusicEventRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: 'Некорректное событие.' });
        return;
    }
    const type = parsed.data.type;
    const sessionId = parsed.data.sessionId.toLowerCase();
    const trackId = cleanId(parsed.data.trackId);
    const albumId = cleanId(parsed.data.albumId);
    const playlistId = cleanId(parsed.data.playlistId);
    let source: string | null = null;
    if (parsed.data.source != null && parsed.data.source.trim() !== '') {
        source = sanitizeMusicSource(parsed.data.source);
        if (!source) {
            res.status(400).json({ message: 'Некорректное событие.' });
            return;
        }
    }
    if ((type === 'play_start' || type === 'play_complete') && !trackId) {
        res.status(400).json({ message: 'Некорректное событие.' });
        return;
    }
    if (type === 'share' && !trackId && !albumId && !playlistId) {
        res.status(400).json({ message: 'Некорректное событие.' });
        return;
    }
    try {
        const target = await publishedTarget(type, trackId, albumId, playlistId);
        if (!target) {
            res.status(404).json({ message: 'Не найдено.' });
            return;
        }
        if (await isDuplicate(type, sessionId, target)) {
            res.json(MusicEventResponseSchema.parse({ recorded: false, deduped: true }));
            return;
        }
        await MusicEvent.create({
            type,
            sessionId,
            trackId: target.trackId,
            albumId: target.albumId,
            playlistId: target.playlistId,
            source,
            userId: req.dbUser?._id ?? null,
        });
        res.json(MusicEventResponseSchema.parse({ recorded: true }));
    } catch (err) {
        console.error('Music event failed:', err);
        res.status(500).json({ message: 'Не удалось записать событие.' });
    }
};

/**
 * Складывает агрегацию в карту id → счётчики.
 * @param rows Строки Mongo
 * @returns Карта для ответа
 */
const toStatsMap = (rows: CountRow[]): Record<string, ItemStats> => {
    const map: Record<string, ItemStats> = {};
    for (const row of rows) {
        if (!row._id) {
            continue;
        }
        map[String(row._id)] = {
            plays7d: row.plays7d,
            playsAll: row.playsAll,
            completes7d: row.completes7d,
            completesAll: row.completesAll,
        };
    }
    return map;
};

/**
 * Считает прослушивания и дослушивания по одному полю id.
 * @param field trackId, albumId или playlistId
 * @param since Начало окна «7 дней» для plays7d и completes7d
 * @returns Строки агрегации
 */
const countByField = (field: 'trackId' | 'albumId' | 'playlistId', since: Date) => (
    MusicEvent.aggregate<CountRow>([
        {
            $match: {
                type: { $in: ['play_start', 'play_complete'] },
                [field]: { $nin: [null, ''] },
            },
        },
        {
            $group: {
                _id: `$${field}`,
                playsAll: { $sum: { $cond: [{ $eq: ['$type', 'play_start'] }, 1, 0] } },
                plays7d: {
                    $sum: {
                        $cond: [{
                            $and: [
                                { $eq: ['$type', 'play_start'] },
                                { $gte: ['$createdAt', since] },
                            ],
                        }, 1, 0],
                    },
                },
                completesAll: { $sum: { $cond: [{ $eq: ['$type', 'play_complete'] }, 1, 0] } },
                completes7d: {
                    $sum: {
                        $cond: [{
                            $and: [
                                { $eq: ['$type', 'play_complete'] },
                                { $gte: ['$createdAt', since] },
                            ],
                        }, 1, 0],
                    },
                },
            },
        },
    ])
);

/**
 * Сводка за 7 дней и счётчики по библиотеке.
 * @route GET /api/music/admin/stats
 * @access super_admin
 * @param _req Не используется: роль уже проверена
 * @param res Счётчики без сессий и userId
 */
export const getMusicStats = async (_req: Request, res: Response): Promise<void> => {
    try {
        const since = new Date(Date.now() - STATS_WINDOW_MS);
        const [summaryRows, sourceRows, trackRows, byTrack, byAlbum, byPlaylist] = await Promise.all([
            MusicEvent.aggregate<{ _id: string; count: number }>([
                { $match: { createdAt: { $gte: since } } },
                { $group: { _id: '$type', count: { $sum: 1 } } },
            ]),
            MusicEvent.aggregate<{ _id: string | null; count: number }>([
                { $match: { createdAt: { $gte: since }, type: 'play_start' } },
                { $group: { _id: { $ifNull: ['$source', ''] }, count: { $sum: 1 } } },
                { $sort: { count: -1, _id: 1 } },
                { $limit: MUSIC_STATS_TOP },
            ]),
            MusicEvent.aggregate<{ _id: string; plays: number }>([
                {
                    $match: {
                        createdAt: { $gte: since },
                        type: 'play_start',
                        trackId: { $nin: [null, ''] },
                    },
                },
                { $group: { _id: '$trackId', plays: { $sum: 1 } } },
                { $sort: { plays: -1, _id: 1 } },
                { $limit: MUSIC_STATS_TOP },
            ]),
            countByField('trackId', since),
            countByField('albumId', since),
            countByField('playlistId', since),
        ]);
        const countOf = (type: string) => summaryRows.find((row) => row._id === type)?.count ?? 0;
        const ids = trackRows
            .map((row) => row._id)
            .filter((id) => mongoose.Types.ObjectId.isValid(id));
        const known = await MusicTrack.find({ _id: { $in: ids } }).select('title');
        const titles = new Map(known.map((track) => [String(track._id), track.title]));
        const body = {
            days: MUSIC_STATS_DAYS,
            summary: {
                plays: countOf('play_start'),
                completes: countOf('play_complete'),
                shares: countOf('share'),
                topSources: sourceRows.map((row) => ({
                    source: row._id ?? '',
                    count: row.count,
                })),
                topTracks: trackRows.map((row) => ({
                    trackId: String(row._id),
                    title: titles.get(String(row._id)) ?? 'Запись удалена',
                    plays: row.plays,
                })),
            },
            tracks: toStatsMap(byTrack),
            albums: toStatsMap(byAlbum),
            playlists: toStatsMap(byPlaylist),
        };
        res.set('Cache-Control', 'no-store');
        res.json(MusicStatsResponseSchema.parse(body));
    } catch (err) {
        console.error('Music stats failed:', err);
        res.status(500).json({ message: 'Не удалось собрать статистику.' });
    }
};
