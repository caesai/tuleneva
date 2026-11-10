/**
 * @file Превью 1200×630 для Open Graph. Обложка по центру, фон — её размытая копия.
 */
import sharp from 'sharp';
import type { Response } from 'express';
import type { ObjectStorage } from '../storage/objectStorage';

/** Ширина карточки, которую ждут Telegram и VK. */
export const SHARE_WIDTH = 1200;

/** Высота карточки summary_large_image. */
export const SHARE_HEIGHT = 630;

const cache = new Map<string, Buffer>();
const CACHE_LIMIT = 64;

/**
 * Читает объект целиком.
 * @param storage Хранилище
 * @param key Серверный ключ
 * @returns Байты или null
 */
const readObjectBuffer = async (
    storage: ObjectStorage,
    key: string,
): Promise<Buffer | null> => {
    const opened = await storage.open(key);
    if (!opened) {
        return null;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
};

/**
 * Собирает JPEG 1200×630: размытый фон на всю карточку и обложка по центру.
 * @param source Исходная обложка
 * @returns JPEG
 */
export const renderShareJpeg = async (source: Buffer): Promise<Buffer> => {
    const background = await sharp(source)
        .rotate()
        .resize(SHARE_WIDTH, SHARE_HEIGHT, { fit: 'cover', position: 'centre' })
        .blur(32)
        .modulate({ brightness: 0.72 })
        .toBuffer();
    const foreground = await sharp(source)
        .rotate()
        .resize(SHARE_HEIGHT, SHARE_HEIGHT, { fit: 'inside' })
        .toBuffer();
    return sharp(background)
        .composite([{ input: foreground, gravity: 'centre' }])
        .jpeg({ quality: 82 })
        .toBuffer();
};

/**
 * Отдаёт JPEG из кэша или собирает его заново.
 * Ключ кэша должен меняться вместе с обложкой (coverKey и updatedAt).
 * @param cacheKey Ключ кэша
 * @param source Исходная обложка
 * @returns JPEG 1200×630
 */
export const cachedShareJpeg = async (cacheKey: string, source: Buffer): Promise<Buffer> => {
    const hit = cache.get(cacheKey);
    if (hit) {
        return hit;
    }
    const jpeg = await renderShareJpeg(source);
    if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest) {
            cache.delete(oldest);
        }
    }
    cache.set(cacheKey, jpeg);
    return jpeg;
};

/**
 * Стримит публичный JPEG превью. 404, если объекта нет.
 * @param res Ответ Express
 * @param storage Хранилище
 * @param objectKey Ключ обложки
 * @param cacheKey Ключ кэша, включая время обновления документа
 * @returns true, если ответ уже отправлен
 */
export const sendShareJpeg = async (
    res: Response,
    storage: ObjectStorage,
    objectKey: string,
    cacheKey: string,
): Promise<boolean> => {
    const source = await readObjectBuffer(storage, objectKey);
    if (!source) {
        return false;
    }
    const jpeg = await cachedShareJpeg(cacheKey, source);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('Content-Type', 'image/jpeg');
    res.send(jpeg);
    return true;
};
