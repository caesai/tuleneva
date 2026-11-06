/**
 * @file Безопасные ключи медиа. В ключ не попадает имя файла пользователя.
 */

const OBJECT_KEY = /^music\/[a-f0-9]{24}\/(audio\.mp3|cover\.(jpg|png|webp))$/;

/**
 * Проверяет, что ключ собрал сервер, а не клиент.
 * @param key Ключ объекта
 * @returns true для music/{24 hex}/audio.mp3 или cover.jpg|png|webp
 */
export const isSafeObjectKey = (key: string): boolean => OBJECT_KEY.test(key);

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
