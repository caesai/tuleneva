/**
 * @file Контракт публичного каталога музыки и анонимной статистики прослушиваний.
 */
import { z } from 'zod';
import { MUSIC_EVENT_TYPES, MUSIC_STATS_DAYS } from '../musicListen';

/** Запись, которую можно слушать без входа. Ключей хранилища здесь нет. */
export const PublicMusicTrackSchema = z.object({
    id: z.string(),
    title: z.string(),
    credits: z.string(),
    description: z.string().nullable(),
    hasCover: z.boolean(),
    /** Номер байтов MP3. У старой записи без поля сервер отдаёт 0. */
    audioVersion: z.number().int().nonnegative(),
    /** Номер байтов обложки. Нет обложки или старое поле — 0. */
    coverVersion: z.number().int().nonnegative(),
    publishedAt: z.string().nullable(),
    /** Опубликованный альбом или null, если запись ещё без альбома. */
    albumId: z.string().nullable(),
}).strict();

/** Карточка альбома или плейлиста без состава. */
export const PublicCollectionCardSchema = z.object({
    id: z.string(),
    type: z.enum(['album', 'playlist']),
    title: z.string(),
    description: z.string().nullable(),
    hasCover: z.boolean(),
    /** Номер байтов обложки. Старая подборка без поля — 0. */
    coverVersion: z.number().int().nonnegative(),
    trackCount: z.number().int().nonnegative(),
    publishedAt: z.string().nullable(),
}).strict();

/** Опубликованная подборка и её записи по порядку. */
export const PublicCollectionSchema = PublicCollectionCardSchema.extend({
    tracks: z.array(PublicMusicTrackSchema),
}).strict();

/** Каталог: обложки подборок и синглы, которым некуда больше деться. */
export const PublicCatalogSchema = z.object({
    collections: z.array(PublicCollectionCardSchema),
    singles: z.array(PublicMusicTrackSchema),
}).strict();

/** Ответ списка опубликованных записей. */
export const PublicMusicListSchema = z.object({
    tracks: z.array(PublicMusicTrackSchema),
}).strict();

/** Запись в админке: плюс статус и альбом, даже если альбом ещё черновик. */
export const ManageMusicTrackSchema = PublicMusicTrackSchema.extend({
    status: z.enum(['draft', 'published']),
    albumTitle: z.string().nullable(),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
}).strict();

/** Подборка в админке, вместе с черновиками записей. */
export const ManageCollectionSchema = PublicCollectionCardSchema.extend({
    status: z.enum(['draft', 'published']),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
    tracks: z.array(ManageMusicTrackSchema),
}).strict();

const optionalObjectId = z.string().regex(/^[a-f\d]{24}$/i).nullable().optional();

/**
 * Тело POST /api/music/events.
 * play_start и play_complete требуют trackId. share — хотя бы одну цель.
 * Проверка целей живёт в обработчике: черновик не считается.
 */
export const MusicEventRequestSchema = z.object({
    type: z.enum(MUSIC_EVENT_TYPES),
    sessionId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    trackId: optionalObjectId,
    albumId: optionalObjectId,
    playlistId: optionalObjectId,
    source: z.string().max(80).nullable().optional(),
}).strict();

/** Ответ приёма события. deduped — повтор внутри окна, в базу не писали. */
export const MusicEventResponseSchema = z.object({
    recorded: z.boolean(),
    deduped: z.boolean().optional(),
}).strict();

/** Счётчики одной записи, альбома или плейлиста. */
export const MusicItemStatsSchema = z.object({
    plays7d: z.number().int().nonnegative(),
    playsAll: z.number().int().nonnegative(),
    completes7d: z.number().int().nonnegative(),
    completesAll: z.number().int().nonnegative(),
}).strict();

/** Сводка GET /api/music/admin/stats. userId и sessionId сюда не попадают. */
export const MusicStatsResponseSchema = z.object({
    days: z.literal(MUSIC_STATS_DAYS),
    summary: z.object({
        plays: z.number().int().nonnegative(),
        completes: z.number().int().nonnegative(),
        shares: z.number().int().nonnegative(),
        topSources: z.array(z.object({
            source: z.string(),
            count: z.number().int().nonnegative(),
        }).strict()),
        topTracks: z.array(z.object({
            trackId: z.string(),
            title: z.string(),
            plays: z.number().int().nonnegative(),
        }).strict()),
    }).strict(),
    tracks: z.record(z.string(), MusicItemStatsSchema),
    albums: z.record(z.string(), MusicItemStatsSchema),
    playlists: z.record(z.string(), MusicItemStatsSchema),
}).strict();
