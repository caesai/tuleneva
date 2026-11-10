/**
 * @file Безопасные ключи медиа. В ключ не попадает имя файла пользователя.
 */

const TRACK_KEY = /^music\/[a-f0-9]{24}\/(audio\.mp3|cover\.(jpg|png|webp))$/;
const COLLECTION_COVER_KEY = /^music\/collections\/[a-f0-9]{24}\/cover\.(jpg|png|webp)$/;

/**
 * Проверяет, что ключ собрал сервер, а не клиент.
 * @param key Ключ объекта
 * @returns true для файла записи или обложки подборки
 */
export const isSafeObjectKey = (key: string): boolean => (
    TRACK_KEY.test(key) || COLLECTION_COVER_KEY.test(key)
);

/**
 * Ключ MP3 для записи.
 * @param trackId Mongo ObjectId строкой
 * @returns Ключ audio.mp3
 */
export const audioObjectKey = (trackId: string): string => `music/${trackId}/audio.mp3`;

/**
 * Ключ обложки.
 * @param trackId Mongo ObjectId строкой
 * @param extension jpg, png или webp
 * @returns Ключ cover.*
 */
export const coverObjectKey = (
    trackId: string,
    extension: 'jpg' | 'png' | 'webp',
): string => `music/${trackId}/cover.${extension}`;

/**
 * Ключ обложки альбома или плейлиста. Не пересекается с обложкой записи.
 * @param collectionId Mongo ObjectId строкой
 * @param extension jpg, png или webp
 * @returns Ключ cover.*
 */
export const collectionCoverObjectKey = (
    collectionId: string,
    extension: 'jpg' | 'png' | 'webp',
): string => `music/collections/${collectionId}/cover.${extension}`;
