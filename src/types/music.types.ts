/**
 * @file Запись в каталоге. Медиа приходят отдельными URL, не байтами.
 */

/** Статус, который видит только супер-админ. */
export type TMusicStatus = 'draft' | 'published';

/** Карточка записи для плеера и списка. */
export interface IMusicTrack {
    id: string;
    title: string;
    credits: string;
    description: string | null;
    hasCover: boolean;
    publishedAt: string | null;
    status?: TMusicStatus;
    createdAt?: string | null;
    updatedAt?: string | null;
}
