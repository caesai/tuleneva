/**
 * @file Контракт публичного каталога музыки.
 */
import { z } from 'zod';

/** Запись, которую можно слушать без входа. Ключей хранилища здесь нет. */
export const PublicMusicTrackSchema = z.object({
    id: z.string(),
    title: z.string(),
    credits: z.string(),
    description: z.string().nullable(),
    hasCover: z.boolean(),
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
