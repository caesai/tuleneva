/**
 * @file Куда входит запись: один альбом и сколько угодно плейлистов.
 * Снятие с альбома не трогает плейлисты. Новая запись без альбома никуда не пишется.
 */
import mongoose, { type Types } from 'mongoose';
import MusicCollection, { type MusicCollectionDocument } from '../models/MusicCollection';
import MusicTrack from '../models/MusicTrack';

/** Сколько записей держит одна подборка. */
const MAX_TRACKS = 100;

/**
 * Проверяет, что id — существующий альбом, до записи файла.
 * @param albumId Id альбома
 * @returns Ошибка, если это не альбом
 */
export const requireAlbum = async (
    albumId: string,
): Promise<{ ok: true } | { ok: false; message: string }> => {
    if (!mongoose.Types.ObjectId.isValid(albumId)) {
        return { ok: false, message: 'Альбом не найден.' };
    }
    const album = await MusicCollection.findOne({ _id: albumId, type: 'album' }).select('_id');
    if (!album) {
        return { ok: false, message: 'Альбом не найден.' };
    }
    return { ok: true };
};

/**
 * Кладёт запись в альбом или убирает из всех альбомов.
 * Если она уже была в другом альбоме, она оттуда уходит.
 * @param trackId Запись
 * @param albumId Альбом или null, чтобы оставить без альбома
 * @returns Ошибка, если альбома нет
 */
export const placeTrackInAlbum = async (
    trackId: Types.ObjectId,
    albumId: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> => {
    if (!albumId) {
        await MusicCollection.updateMany(
            { type: 'album', trackIds: trackId },
            { $pull: { trackIds: trackId } },
        );
        return { ok: true };
    }
    if (!mongoose.Types.ObjectId.isValid(albumId)) {
        return { ok: false, message: 'Альбом не найден.' };
    }
    const album = await MusicCollection.findOne({ _id: albumId, type: 'album' });
    if (!album) {
        return { ok: false, message: 'Альбом не найден.' };
    }
    await MusicCollection.updateMany(
        { type: 'album', _id: { $ne: album._id }, trackIds: trackId },
        { $pull: { trackIds: trackId } },
    );
    const already = album.trackIds.some((id) => String(id) === String(trackId));
    if (!already) {
        album.trackIds.push(trackId);
        await album.save();
    }
    return { ok: true };
};

/**
 * Заменяет порядок записей в подборке.
 * Для альбома запись уходит из прежнего альбома. Плейлист чужие списки не трогает.
 * @param collection Подборка
 * @param rawIds Порядок с клиента
 * @returns Сообщение, если список нельзя сохранить
 */
export const replaceCollectionTracks = async (
    collection: MusicCollectionDocument,
    rawIds: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> => {
    if (!Array.isArray(rawIds) || rawIds.some((id) => typeof id !== 'string')) {
        return { ok: false, message: 'Нужен список записей.' };
    }
    if (rawIds.length > MAX_TRACKS) {
        return { ok: false, message: `В подборке не больше ${MAX_TRACKS} записей.` };
    }
    if (new Set(rawIds).size !== rawIds.length) {
        return { ok: false, message: 'Запись повторяется в списке.' };
    }
    if (rawIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
        return { ok: false, message: 'Одна из записей не найдена.' };
    }
    const objectIds = rawIds.map((id) => new mongoose.Types.ObjectId(id));
    if (objectIds.length > 0) {
        const found = await MusicTrack.find({ _id: { $in: objectIds } }).select('_id');
        if (found.length !== objectIds.length) {
            return { ok: false, message: 'Одна из записей не найдена.' };
        }
    }
    if (collection.type === 'album' && objectIds.length > 0) {
        await MusicCollection.updateMany(
            { type: 'album', _id: { $ne: collection._id }, trackIds: { $in: objectIds } },
            { $pull: { trackIds: { $in: objectIds } } },
        );
    }
    collection.trackIds = objectIds;
    await collection.save();
    return { ok: true };
};

/**
 * Убирает запись из всех альбомов и плейлистов. Саму запись не удаляет.
 * @param trackId Запись
 */
export const detachTrack = async (trackId: Types.ObjectId): Promise<void> => {
    await MusicCollection.updateMany(
        { trackIds: trackId },
        { $pull: { trackIds: trackId } },
    );
};
