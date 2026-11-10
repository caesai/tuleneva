/**
 * @file Публичный каталог и публикация музыки. Пишет только super_admin.
 */
import express, { type Request, type RequestHandler, type Response } from 'express';
import mongoose from 'mongoose';
import MusicTrack, { type MusicTrackDocument } from '../models/MusicTrack';
import { isSuperAdmin } from '../auth/roleHelpers';
import { requireSuperAdmin } from '../auth/requireSuperAdmin';
import type { ByteRange, ObjectStorage } from '../storage/objectStorage';
import { audioObjectKey, coverObjectKey } from '../storage/objectKey';
import { AUDIO_MAX_BYTES } from './musicLimits';
import { detectCover, isMp3, parseMusicText } from './musicValidation';
import { parseMultipart } from './parseMultipart';

interface MusicRouterOptions {
    /** JWT обязателен. */
    authenticateToken: RequestHandler;
    /** Пользователь есть в базе. */
    verifyUserExists: RequestHandler;
    /** JWT по желанию: черновик видит только super_admin. */
    optionalAuthenticate: RequestHandler;
    /** null, пока бакет не настроен. */
    objectStorage: ObjectStorage | null;
}

/**
 * Публичное представление без ключей хранилища и без статуса черновика.
 * @param track Документ
 * @returns Поля для гостя
 */
const toPublicTrack = (track: MusicTrackDocument) => ({
    id: String(track._id),
    title: track.title,
    credits: track.credits,
    description: track.description ? track.description : null,
    hasCover: Boolean(track.coverKey),
    publishedAt: track.publishedAt ? track.publishedAt.toISOString() : null,
});

/**
 * Представление для супер-админа: статус и даты.
 * @param track Документ
 * @returns Поля админки
 */
const toManageTrack = (track: MusicTrackDocument) => ({
    ...toPublicTrack(track),
    status: track.status,
    createdAt: track.createdAt ? track.createdAt.toISOString() : null,
    updatedAt: track.updatedAt ? track.updatedAt.toISOString() : null,
});

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
 * Express 5 отдаёт param строкой или массивом.
 * @param value Параметр маршрута
 * @returns Одна строка
 */
const routeParam = (value: string | string[] | undefined): string => {
    if (Array.isArray(value)) {
        return value[0] ?? '';
    }
    return value ?? '';
};

/**
 * Черновик скрыт от всех, кроме super_admin. Чужим — 404, не 403.
 * @param track Документ или null
 * @param role Роль зрителя
 * @returns Документ, который можно показать
 */
const visibleTrack = (
    track: MusicTrackDocument | null,
    role?: string | null,
): MusicTrackDocument | null => {
    if (!track) {
        return null;
    }
    if (track.status !== 'published' && !isSuperAdmin(role)) {
        return null;
    }
    return track;
};

/**
 * Отдаёт объект с Range.
 * @param req Запрос
 * @param res Ответ
 * @param storage Хранилище
 * @param key Ключ
 * @param contentType MIME из нашей проверки
 * @param isPublic Кэш публичной записи
 */
const sendStoredObject = async (
    req: Request,
    res: Response,
    storage: ObjectStorage,
    key: string,
    contentType: string,
    isPublic: boolean,
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
    res.set('Cache-Control', isPublic ? 'public, max-age=3600' : 'private, no-store');
    res.set('Content-Disposition', 'inline; filename="audio.mp3"');
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

/**
 * Маршруты /api/music.
 * @param options Auth и хранилище
 * @returns Router
 */
export const createMusicRouter = ({
    authenticateToken,
    verifyUserExists,
    optionalAuthenticate,
    objectStorage,
}: MusicRouterOptions) => {
    const router = express.Router();
    const superAdmin = [authenticateToken, verifyUserExists, requireSuperAdmin];

    /**
     * Хранилище не настроено.
     * @param res Ответ
     * @returns true, если ответили 503
     */
    const rejectIfNoStorage = (res: Response): boolean => {
        if (objectStorage) {
            return false;
        }
        res.status(503).json({
            message: 'Хранилище файлов не настроено. Задайте OBJECT_STORAGE_DRIVER и параметры бакета.',
        });
        return true;
    };

    /**
     * @route GET /api/music/tracks
     * @description Опубликованные записи. Черновиков нет.
     */
    router.get('/tracks', async (_req, res) => {
        const tracks = await MusicTrack.find({ status: 'published' })
            .sort({ publishedAt: -1, createdAt: -1 });
        res.json({ tracks: tracks.map(toPublicTrack) });
    });

    /**
     * @route GET /api/music/admin/tracks
     * @description Все записи, включая черновики.
     * @access super_admin
     */
    router.get('/admin/tracks', ...superAdmin, async (_req, res) => {
        const tracks = await MusicTrack.find().sort({ updatedAt: -1 });
        res.json({ tracks: tracks.map(toManageTrack) });
    });

    /**
     * @route POST /api/music/tracks
     * @description Черновик: MP3, название, авторы, необязательные описание и обложка.
     * @access super_admin
     */
    router.post('/tracks', ...superAdmin, async (req, res) => {
        if (rejectIfNoStorage(res) || !objectStorage) {
            return;
        }
        let parsed;
        try {
            parsed = await parseMultipart(req, AUDIO_MAX_BYTES);
        } catch (err) {
            const tooBig = err instanceof Error && err.message === 'FILE_TOO_LARGE';
            res.status(tooBig ? 413 : 400).json({
                message: tooBig ? 'Файл больше 30 МБ.' : 'Не удалось прочитать форму.',
            });
            return;
        }
        const text = parseMusicText(parsed.fields);
        if (!text.ok) {
            res.status(400).json({ message: text.message });
            return;
        }
        const audio = parsed.files.audio;
        if (!audio || !isMp3(audio.buffer) || audio.buffer.length > AUDIO_MAX_BYTES) {
            res.status(400).json({ message: 'Нужен файл MP3.' });
            return;
        }
        let cover: {
            extension: 'jpg' | 'png' | 'webp';
            contentType: string;
            body: Buffer;
        } | null = null;
        if (parsed.files.cover) {
            const kind = detectCover(parsed.files.cover.buffer);
            if (!kind) {
                res.status(400).json({ message: 'Обложка — JPEG, PNG или WebP до 2 МБ.' });
                return;
            }
            cover = {
                extension: kind.extension,
                contentType: kind.contentType,
                body: parsed.files.cover.buffer,
            };
        }

        const id = new mongoose.Types.ObjectId();
        const audioKey = audioObjectKey(String(id));
        const coverKey = cover ? coverObjectKey(String(id), cover.extension) : null;
        try {
            await objectStorage.put(audioKey, audio.buffer, 'audio/mpeg');
            if (cover && coverKey) {
                await objectStorage.put(coverKey, cover.body, cover.contentType);
            }
            const track = await MusicTrack.create({
                _id: id,
                title: text.value.title,
                credits: text.value.credits,
                description: text.value.description,
                status: 'draft',
                audioKey,
                coverKey,
                coverContentType: cover?.contentType ?? null,
                audioBytes: audio.buffer.length,
                createdBy: req.dbUser!._id,
                updatedBy: req.dbUser!._id,
            });
            res.status(201).json({ track: toManageTrack(track) });
        } catch (err) {
            await objectStorage.delete(audioKey).catch(() => undefined);
            if (coverKey) {
                await objectStorage.delete(coverKey).catch(() => undefined);
            }
            console.error('Music draft create failed:', err);
            res.status(500).json({ message: 'Не удалось сохранить запись.' });
        }
    });

    /**
     * @route GET /api/music/tracks/:id
     * @description Опубликованная запись или черновик для super_admin.
     */
    router.get('/tracks/:id', optionalAuthenticate, async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        const track = visibleTrack(
            await MusicTrack.findById(routeParam(req.params.id)),
            req.dbUser?.role,
        );
        if (!track) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        const body = track.status === 'published' || !isSuperAdmin(req.dbUser?.role)
            ? toPublicTrack(track)
            : toManageTrack(track);
        res.json({ track: body });
    });

    /**
     * @route PATCH /api/music/tracks/:id
     * @description Правка текста и, по желанию, замена MP3 или обложки.
     * @access super_admin
     */
    router.patch('/tracks/:id', ...superAdmin, async (req, res) => {
        if (rejectIfNoStorage(res) || !objectStorage) {
            return;
        }
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        const track = await MusicTrack.findById(routeParam(req.params.id));
        if (!track) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        let parsed;
        try {
            parsed = await parseMultipart(req, AUDIO_MAX_BYTES);
        } catch (err) {
            const tooBig = err instanceof Error && err.message === 'FILE_TOO_LARGE';
            res.status(tooBig ? 413 : 400).json({
                message: tooBig ? 'Файл больше 30 МБ.' : 'Не удалось прочитать форму.',
            });
            return;
        }
        const text = parseMusicText({
            title: parsed.fields.title ?? track.title,
            credits: parsed.fields.credits ?? track.credits,
            description: parsed.fields.description ?? track.description,
        });
        if (!text.ok) {
            res.status(400).json({ message: text.message });
            return;
        }
        if (parsed.files.audio) {
            if (!isMp3(parsed.files.audio.buffer) || parsed.files.audio.buffer.length > AUDIO_MAX_BYTES) {
                res.status(400).json({ message: 'Нужен файл MP3.' });
                return;
            }
        }
        let nextCover: { key: string; contentType: string; body: Buffer } | null = null;
        if (parsed.files.cover) {
            const kind = detectCover(parsed.files.cover.buffer);
            if (!kind) {
                res.status(400).json({ message: 'Обложка — JPEG, PNG или WebP до 2 МБ.' });
                return;
            }
            nextCover = {
                key: coverObjectKey(String(track._id), kind.extension),
                contentType: kind.contentType,
                body: parsed.files.cover.buffer,
            };
        }
        const previousCover = track.coverKey;
        try {
            if (parsed.files.audio) {
                await objectStorage.put(track.audioKey, parsed.files.audio.buffer, 'audio/mpeg');
                track.audioBytes = parsed.files.audio.buffer.length;
            }
            if (nextCover) {
                await objectStorage.put(nextCover.key, nextCover.body, nextCover.contentType);
                if (previousCover && previousCover !== nextCover.key) {
                    await objectStorage.delete(previousCover);
                }
                track.coverKey = nextCover.key;
                track.coverContentType = nextCover.contentType;
            }
            track.title = text.value.title;
            track.credits = text.value.credits;
            track.description = text.value.description;
            track.updatedBy = req.dbUser!._id;
            await track.save();
            res.json({ track: toManageTrack(track) });
        } catch (err) {
            console.error('Music update failed:', err);
            res.status(500).json({ message: 'Не удалось обновить запись.' });
        }
    });

    /**
     * @route POST /api/music/tracks/:id/publish
     * @description Явная публикация черновика.
     * @access super_admin
     */
    router.post('/tracks/:id/publish', ...superAdmin, async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        const track = await MusicTrack.findById(routeParam(req.params.id));
        if (!track) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        track.status = 'published';
        if (!track.publishedAt) {
            track.publishedAt = new Date();
        }
        track.updatedBy = req.dbUser!._id;
        await track.save();
        res.json({ track: toManageTrack(track) });
    });

    /**
     * @route POST /api/music/tracks/:id/unpublish
     * @description Снова черновик. Ссылка для гостей перестаёт открываться.
     * @access super_admin
     */
    router.post('/tracks/:id/unpublish', ...superAdmin, async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        const track = await MusicTrack.findById(routeParam(req.params.id));
        if (!track) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        track.status = 'draft';
        track.publishedAt = null;
        track.updatedBy = req.dbUser!._id;
        await track.save();
        res.json({ track: toManageTrack(track) });
    });

    /**
     * @route DELETE /api/music/tracks/:id
     * @description Удаляет метаданные и объекты.
     * @access super_admin
     */
    router.delete('/tracks/:id', ...superAdmin, async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        const track = await MusicTrack.findById(routeParam(req.params.id));
        if (!track) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        if (objectStorage) {
            await objectStorage.delete(track.audioKey).catch((err) => {
                console.error('Music audio delete failed:', err);
            });
            if (track.coverKey) {
                await objectStorage.delete(track.coverKey).catch((err) => {
                    console.error('Music cover delete failed:', err);
                });
            }
        }
        await track.deleteOne();
        res.json({ deleted: true });
    });

    /**
     * Отдаёт аудио или обложку, если зрителю можно знать о записи.
     * @param kind audio или cover
     */
    const sendMedia = (kind: 'audio' | 'cover') => async (req: Request, res: Response) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        const track = visibleTrack(
            await MusicTrack.findById(routeParam(req.params.id)),
            req.dbUser?.role,
        );
        if (!track) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        const key = kind === 'audio' ? track.audioKey : track.coverKey;
        const contentType = kind === 'audio'
            ? 'audio/mpeg'
            : (track.coverContentType || 'application/octet-stream');
        if (!key) {
            res.status(404).json({ message: 'Файл не найден.' });
            return;
        }
        if (!objectStorage) {
            rejectIfNoStorage(res);
            return;
        }
        try {
            await sendStoredObject(
                req,
                res,
                objectStorage,
                key,
                contentType,
                track.status === 'published',
            );
        } catch (err) {
            console.error('Music media failed:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Не удалось отдать файл.' });
            }
        }
    };

    /**
     * @route GET /api/music/tracks/:id/audio
     * @description MP3 с поддержкой Range. Черновик — только super_admin.
     */
    router.get('/tracks/:id/audio', optionalAuthenticate, sendMedia('audio'));

    /**
     * @route GET /api/music/tracks/:id/cover
     * @description Обложка. Черновик — только super_admin.
     */
    router.get('/tracks/:id/cover', optionalAuthenticate, sendMedia('cover'));

    return router;
};
