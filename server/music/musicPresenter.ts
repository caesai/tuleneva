/**
 * @file Карточки записей и подборок без ключей хранилища.
 */
import type { Types } from 'mongoose';
import MusicCollection, { type MusicCollectionDocument } from '../models/MusicCollection';
import MusicTrack, { type MusicTrackDocument } from '../models/MusicTrack';
import { storedMediaVersion } from './mediaVersion';

/** Альбом, в котором уже лежит запись. */
export interface AlbumRef {
    id: string;
    title: string;
    status: 'draft' | 'published';
}

/**
 * Публичная карточка. albumId — только опубликованный альбом, иначе null.
 * @param track Документ
 * @param albumId Опубликованный альбом или null
 * @returns Поля для гостя
 */
export const toPublicTrack = (track: MusicTrackDocument, albumId: string | null = null) => ({
    id: String(track._id),
    title: track.title,
    credits: track.credits,
    description: track.description ? track.description : null,
    hasCover: Boolean(track.coverKey),
    audioVersion: storedMediaVersion(track.audioVersion),
    coverVersion: storedMediaVersion(track.coverVersion),
    publishedAt: track.publishedAt ? track.publishedAt.toISOString() : null,
    albumId,
});

/**
 * Карточка для супер-админа. albumId может указывать и на черновик альбома.
 * @param track Документ
 * @param album Альбом записи или null
 * @returns Поля админки
 */
export const toManageTrack = (
    track: MusicTrackDocument,
    album: { id: string; title: string } | null = null,
) => ({
    ...toPublicTrack(track, album?.id ?? null),
    albumTitle: album?.title ?? null,
    status: track.status,
    createdAt: track.createdAt ? track.createdAt.toISOString() : null,
    updatedAt: track.updatedAt ? track.updatedAt.toISOString() : null,
});

/**
 * Какой альбом держит каждую запись. Если запись каким-то образом в двух,
 * предпочтение у опубликованного.
 * @returns Индекс id записи → альбом
 */
export const loadAlbumIndex = async (): Promise<Map<string, AlbumRef>> => {
    const albums = await MusicCollection.find({ type: 'album' }).select('title status trackIds');
    const index = new Map<string, AlbumRef>();
    for (const album of albums) {
        const ref: AlbumRef = {
            id: String(album._id),
            title: album.title,
            status: album.status,
        };
        for (const trackId of album.trackIds) {
            const key = String(trackId);
            const current = index.get(key);
            if (!current || (ref.status === 'published' && current.status !== 'published')) {
                index.set(key, ref);
            }
        }
    }
    return index;
};

/**
 * Альбом, который можно показать гостю.
 * @param index Индекс альбомов
 * @param trackId Запись
 * @returns Id опубликованного альбома или null
 */
export const publicAlbumId = (index: Map<string, AlbumRef>, trackId: string): string | null => {
    const album = index.get(trackId);
    return album?.status === 'published' ? album.id : null;
};

/**
 * Записи подборки в сохранённом порядке. Пропавшие id пропускаются.
 * @param ids Порядок
 * @param publishedOnly Гостю не показываем черновики
 * @returns Документы
 */
export const loadOrderedTracks = async (
    ids: Types.ObjectId[],
    publishedOnly: boolean,
): Promise<MusicTrackDocument[]> => {
    if (ids.length === 0) {
        return [];
    }
    const found = await MusicTrack.find({
        _id: { $in: ids },
        ...(publishedOnly ? { status: 'published' } : {}),
    });
    const byId = new Map(found.map((track) => [String(track._id), track]));
    return ids
        .map((id) => byId.get(String(id)))
        .filter((track): track is MusicTrackDocument => Boolean(track));
};

/**
 * Сколько опубликованных записей реально есть в списке.
 * @param collection Подборка
 * @param publishedIds Id опубликованных записей
 * @returns Число для карточки
 */
export const publishedTrackCount = (
    collection: MusicCollectionDocument,
    publishedIds: Set<string>,
): number => collection.trackIds.filter((id) => publishedIds.has(String(id))).length;
