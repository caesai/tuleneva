/**
 * @file Запись в каталоге. Медиа приходят отдельными URL, не байтами.
 */

/** Статус, который видит только супер-админ. */
export type TMusicStatus = 'draft' | 'published';

/** Альбом — единственный дом записи. Плейлист может делить её с другими. */
export type TMusicCollectionType = 'album' | 'playlist';

/** Карточка записи для плеера и списка. */
export interface IMusicTrack {
    id: string;
    title: string;
    credits: string;
    description: string | null;
    hasCover: boolean;
    publishedAt: string | null;
    /** Опубликованный альбом. В админке — альбом, даже если он ещё черновик. */
    albumId?: string | null;
    /** Название альбома. Есть только в ответе админки. */
    albumTitle?: string | null;
    status?: TMusicStatus;
    createdAt?: string | null;
    updatedAt?: string | null;
}

/**
 * Альбом или плейлист. `tracks` есть на странице подборки и в админке.
 */
export interface IMusicCollection {
    id: string;
    type: TMusicCollectionType;
    title: string;
    description: string | null;
    hasCover: boolean;
    trackCount: number;
    publishedAt: string | null;
    status?: TMusicStatus;
    createdAt?: string | null;
    updatedAt?: string | null;
    tracks?: IMusicTrack[];
}

/** Публичный каталог: обложки и синглы без опубликованной подборки. */
export interface IMusicCatalog {
    collections: IMusicCollection[];
    singles: IMusicTrack[];
}
