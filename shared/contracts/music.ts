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
}).strict();

/** Ответ списка опубликованных записей. */
export const PublicMusicListSchema = z.object({
    tracks: z.array(PublicMusicTrackSchema),
}).strict();

/** Запись в админке: плюс статус. */
export const ManageMusicTrackSchema = PublicMusicTrackSchema.extend({
    status: z.enum(['draft', 'published']),
    createdAt: z.string().nullable(),
    updatedAt: z.string().nullable(),
}).strict();
