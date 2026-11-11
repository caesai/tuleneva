/**
 * @file Публичный каталог, анонимные события прослушивания и публикация.
 * Пишет каталог только super_admin. События принимает любой гость.
 */
import express, { type Request, type RequestHandler, type Response } from 'express';
import mongoose from 'mongoose';
import MusicTrack, { type MusicTrackDocument } from '../models/MusicTrack';
import { createPresetRateLimiter } from '../auth/rateLimit';
import { isSuperAdmin } from '../auth/roleHelpers';
import { requireSuperAdmin } from '../auth/requireSuperAdmin';
import { getMusicStats, parsePlainMusicEvent, postMusicEvent } from './musicEvents';
import type { ObjectStorage } from '../storage/objectStorage';
import { audioObjectKey, coverObjectKey } from '../storage/objectKey';
import { detachTrack, placeTrackInAlbum, requireAlbum } from './collectionMembership';
import { registerCollectionRoutes } from './collectionRoutes';
import { AUDIO_MAX_BYTES } from './musicLimits';
import { sendShareJpeg } from '../seo/shareImage';
import { bumpMediaVersion, storedMediaVersion } from './mediaVersion';
import { isVersionedMediaRequest, parseRangeHeader, sendStoredObject } from './musicMedia';
import {
    loadAlbumIndex,
    publicAlbumId,
    toManageTrack,
    toPublicTrack,
} from './musicPresenter';
import { isMp3, parseMusicText, readCover } from './musicValidation';
import { parseMultipart } from './parseMultipart';

export { parseRangeHeader };

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
     * Частота по IP в памяти процесса. Адрес в music_events не пишется.
     * Новый роутер — новый счётчик, чтобы тесты не делили лимит.
     */
    const eventsLimiter = createPresetRateLimiter('musicEvents');

    /**
     * @route POST /api/music/events
     * @description Анонимное событие прослушивания или шаринга. Стелс-режим календаря не влияет.
     * JWT необязателен: если участник вошёл, сохраняем его userId.
     */
    router.post(
        '/events',
        eventsLimiter,
        express.text({ type: 'text/plain', limit: '8kb' }),
        optionalAuthenticate,
        parsePlainMusicEvent,
        postMusicEvent,
    );

    /**
     * @route GET /api/music/admin/stats
     * @description Сводка за 7 дней и счётчики записей, альбомов и плейлистов.
     * @access super_admin
     */
    router.get('/admin/stats', ...superAdmin, getMusicStats);

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
        const albums = await loadAlbumIndex();
        res.json({
            tracks: tracks.map((track) => toPublicTrack(track, publicAlbumId(albums, String(track._id)))),
        });
    });

    /**
     * @route GET /api/music/admin/tracks
     * @description Все записи, включая черновики.
     * @access super_admin
     */
    router.get('/admin/tracks', ...superAdmin, async (_req, res) => {
        const tracks = await MusicTrack.find().sort({ updatedAt: -1 });
        const albums = await loadAlbumIndex();
        res.json({
            tracks: tracks.map((track) => toManageTrack(track, albums.get(String(track._id)) ?? null)),
        });
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
        const albumField = parsed.fields.albumId?.trim() ?? '';
        if (albumField) {
            const album = await requireAlbum(albumField);
            if (!album.ok) {
                res.status(400).json({ message: album.message });
                return;
            }
        }
        let cover: {
            extension: 'jpg' | 'png' | 'webp';
            contentType: string;
            body: Buffer;
        } | null = null;
        if (parsed.files.cover) {
            const checked = readCover(parsed.files.cover.buffer);
            if (!checked.ok) {
                res.status(400).json({ message: checked.message });
                return;
            }
            cover = {
                extension: checked.kind.extension,
                contentType: checked.kind.contentType,
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
                audioVersion: 1,
                coverVersion: cover ? 1 : 0,
                audioBytes: audio.buffer.length,
                createdBy: req.dbUser!._id,
                updatedBy: req.dbUser!._id,
            });
            if (albumField) {
                const placed = await placeTrackInAlbum(track._id, albumField);
                if (!placed.ok) {
                    await track.deleteOne();
                    await objectStorage.delete(audioKey).catch(() => undefined);
                    if (coverKey) {
                        await objectStorage.delete(coverKey).catch(() => undefined);
                    }
                    res.status(400).json({ message: placed.message });
                    return;
                }
            }
            const albums = await loadAlbumIndex();
            res.status(201).json({
                track: toManageTrack(track, albums.get(String(track._id)) ?? null),
            });
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
        const albums = await loadAlbumIndex();
        const album = albums.get(String(track._id)) ?? null;
        const body = track.status === 'published' || !isSuperAdmin(req.dbUser?.role)
            ? toPublicTrack(track, publicAlbumId(albums, String(track._id)))
            : toManageTrack(track, album);
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
        const albumField = 'albumId' in parsed.fields ? parsed.fields.albumId.trim() : null;
        if (albumField) {
            const album = await requireAlbum(albumField);
            if (!album.ok) {
                res.status(400).json({ message: album.message });
                return;
            }
        }
        if (parsed.files.audio) {
            if (!isMp3(parsed.files.audio.buffer) || parsed.files.audio.buffer.length > AUDIO_MAX_BYTES) {
                res.status(400).json({ message: 'Нужен файл MP3.' });
                return;
            }
        }
        let nextCover: { key: string; contentType: string; body: Buffer } | null = null;
        if (parsed.files.cover) {
            const checked = readCover(parsed.files.cover.buffer);
            if (!checked.ok) {
                res.status(400).json({ message: checked.message });
                return;
            }
            nextCover = {
                key: coverObjectKey(String(track._id), checked.kind.extension),
                contentType: checked.kind.contentType,
                body: parsed.files.cover.buffer,
            };
        }
        const previousCover = track.coverKey;
        try {
            if (parsed.files.audio) {
                await objectStorage.put(track.audioKey, parsed.files.audio.buffer, 'audio/mpeg');
                track.audioBytes = parsed.files.audio.buffer.length;
                track.audioVersion = bumpMediaVersion(track.audioVersion);
            }
            if (nextCover) {
                await objectStorage.put(nextCover.key, nextCover.body, nextCover.contentType);
                if (previousCover && previousCover !== nextCover.key) {
                    await objectStorage.delete(previousCover);
                }
                track.coverKey = nextCover.key;
                track.coverContentType = nextCover.contentType;
                track.coverVersion = bumpMediaVersion(track.coverVersion);
            }
            track.title = text.value.title;
            track.credits = text.value.credits;
            track.description = text.value.description;
            track.updatedBy = req.dbUser!._id;
            await track.save();
            if (albumField !== null) {
                const placed = await placeTrackInAlbum(track._id, albumField || null);
                if (!placed.ok) {
                    res.status(400).json({ message: placed.message });
                    return;
                }
            }
            const albums = await loadAlbumIndex();
            res.json({ track: toManageTrack(track, albums.get(String(track._id)) ?? null) });
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
        const albums = await loadAlbumIndex();
        res.json({ track: toManageTrack(track, albums.get(String(track._id)) ?? null) });
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
        const albums = await loadAlbumIndex();
        res.json({ track: toManageTrack(track, albums.get(String(track._id)) ?? null) });
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
        await detachTrack(track._id);
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

    /**
     * @route GET /api/music/tracks/:id/og.jpg
     * @description JPEG 1200×630 для og:image записи. Только опубликованная запись с обложкой.
     */
    router.get('/tracks/:id/og.jpg', async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Запись не найдена.' });
            return;
        }
        const track = await MusicTrack.findById(routeParam(req.params.id));
        if (!track || track.status !== 'published' || !track.coverKey) {
            res.status(404).json({ message: 'Файл не найден.' });
            return;
        }
        if (!objectStorage) {
            rejectIfNoStorage(res);
            return;
        }
        try {
            const version = storedMediaVersion(track.coverVersion);
            const sent = await sendShareJpeg(
                res,
                objectStorage,
                track.coverKey,
                `${track.coverKey}:${version}`,
                isVersionedMediaRequest(req.query),
            );
            if (!sent && !res.headersSent) {
                res.status(404).json({ message: 'Файл не найден.' });
            }
        } catch (err) {
            console.error('Track share image failed:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Не удалось собрать превью.' });
            }
        }
    });

    registerCollectionRoutes(router, {
        superAdmin,
        optionalAuthenticate,
        objectStorage,
        rejectIfNoStorage,
    });

    return router;
};
