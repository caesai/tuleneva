/**
 * @file Отдача MP3 и обложек с Range. Ключ и MIME уже проверены вызывающим кодом.
 */
import type { Request, Response } from 'express';
import type { ByteRange, ObjectStorage } from '../storage/objectStorage';

/**
 * Разбирает заголовок Range.
 * @param header Значение Range
 * @param total Размер объекта
 * @returns Диапазон, null если заголовка нет, либо отказ 416
 */
export const parseRangeHeader = (
    header: string | undefined,
    total: number,
): ByteRange | 'unsatisfiable' | null => {
    if (!header) {
        return null;
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
    if (!match || total <= 0) {
        return 'unsatisfiable';
    }
    const startRaw = match[1];
    const endRaw = match[2];
    if (startRaw === '' && endRaw === '') {
        return 'unsatisfiable';
    }
    if (startRaw === '') {
        const suffix = Number(endRaw);
        if (!Number.isFinite(suffix) || suffix <= 0) {
            return 'unsatisfiable';
        }
        return { start: Math.max(0, total - suffix), end: total - 1 };
    }
    const start = Number(startRaw);
    const end = endRaw === '' ? total - 1 : Number(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= total) {
        return 'unsatisfiable';
    }
    return { start, end: Math.min(end, total - 1) };
};

/**
 * Есть ли в запросе непустой `?v=`. Сам номер не сверяется: клиент меняет его вместе с байтами.
 * @param query Query Express
 * @returns true, если URL уже с версией
 */
export const isVersionedMediaRequest = (query: Request['query']): boolean => {
    const raw = query.v;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' && value.length > 0;
};

/**
 * Долгий кэш только у публичного URL с `?v=`. Без версии браузер должен спросить заново.
 * Черновик не кэшируется.
 * @param isPublic Опубликованный файл
 * @param versioned В запросе есть `v`
 * @returns Значение Cache-Control
 */
export const mediaCacheControl = (isPublic: boolean, versioned: boolean): string => {
    if (!isPublic) {
        return 'private, no-store';
    }
    return versioned
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate';
};

/**
 * Отдаёт объект с Range.
 * @param req Запрос
 * @param res Ответ
 * @param storage Хранилище
 * @param key Ключ
 * @param contentType MIME из нашей проверки
 * @param isPublic Кэш публичного файла
 * @param filename Имя в Content-Disposition
 */
export const sendStoredObject = async (
    req: Request,
    res: Response,
    storage: ObjectStorage,
    key: string,
    contentType: string,
    isPublic: boolean,
    filename = 'audio.mp3',
) => {
    const probe = await storage.open(key);
    if (!probe) {
        res.status(404).json({ message: 'Файл не найден.' });
        return;
    }
    probe.stream.destroy();
    const range = parseRangeHeader(req.get('range'), probe.total);
    if (range === 'unsatisfiable') {
        res.status(416).set('Content-Range', `bytes */${probe.total}`).end();
        return;
    }
    const opened = await storage.open(key, range ?? undefined);
    if (!opened) {
        res.status(404).json({ message: 'Файл не найден.' });
        return;
    }
    const start = range ? range.start : 0;
    const end = range ? range.end : Math.max(0, opened.total - 1);
    res.status(range ? 206 : 200);
    res.set('Content-Type', contentType);
    res.set('Accept-Ranges', 'bytes');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', mediaCacheControl(isPublic, isVersionedMediaRequest(req.query)));
    res.set('Content-Disposition', `inline; filename="${filename}"`);
    res.set('Content-Length', String(range ? end - start + 1 : opened.total));
    if (range) {
        res.set('Content-Range', `bytes ${start}-${end}/${opened.total}`);
    }
    opened.stream.on('error', () => {
        if (!res.headersSent) {
            res.status(500).end();
        } else {
            res.destroy();
        }
    });
    opened.stream.pipe(res);
};
