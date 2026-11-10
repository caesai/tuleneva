/**
 * @file Альбомы и плейлисты: публичный каталог и правка супер-админом.
 */
import express, { type RequestHandler, type Response } from 'express';
import mongoose from 'mongoose';
import MusicCollection, { type MusicCollectionDocument } from '../models/MusicCollection';
import MusicTrack from '../models/MusicTrack';
import { isSuperAdmin } from '../auth/roleHelpers';
import type { ObjectStorage } from '../storage/objectStorage';
import { collectionCoverObjectKey } from '../storage/objectKey';
import { replaceCollectionTracks } from './collectionMembership';
import { COVER_MAX_BYTES } from './musicLimits';
import { sendStoredObject } from './musicMedia';
import {
    loadAlbumIndex,
    loadOrderedTracks,
    publicAlbumId,
    publishedTrackCount,
    toManageTrack,
    toPublicTrack,
} from './musicPresenter';
import { parseCollectionText, readCover } from './musicValidation';
import { parseMultipart } from './parseMultipart';

interface CollectionRouteOptions {
    /** Цепочка super_admin. */
    superAdmin: RequestHandler[];
    /** JWT по желанию: черновик видит только super_admin. */
    optionalAuthenticate: RequestHandler;
    /** null, пока бакет не настроен. */
    objectStorage: ObjectStorage | null;
    /**
     * Хранилище не настроено.
     * @param res Ответ
     * @returns true, если ответили 503
     */
    rejectIfNoStorage: (res: Response) => boolean;
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
 * Черновик подборки скрыт от всех, кроме super_admin.
 * @param collection Документ или null
 * @param role Роль зрителя
 * @returns Документ, который можно показать
 */
const visibleCollection = (
    collection: MusicCollectionDocument | null,
    role?: string | null,
): MusicCollectionDocument | null => {
    if (!collection) {
        return null;
    }
    if (collection.status !== 'published' && !isSuperAdmin(role)) {
        return null;
    }
    return collection;
};

/**
 * Карточка без состава.
 * @param collection Документ
 * @param trackCount Сколько записей считать
 * @returns Поля списка
 */
const toCard = (collection: MusicCollectionDocument, trackCount: number) => ({
    id: String(collection._id),
    type: collection.type,
    title: collection.title,
    description: collection.description ? collection.description : null,
    hasCover: Boolean(collection.coverKey),
    trackCount,
    publishedAt: collection.publishedAt ? collection.publishedAt.toISOString() : null,
});

/**
 * Подборка вместе с записями в её порядке.
 * @param collection Документ
 * @param forAdmin Черновики записей тоже
 * @returns Карточка и состав
 */
const presentCollection = async (
    collection: MusicCollectionDocument,
    forAdmin: boolean,
) => {
    const tracks = await loadOrderedTracks(collection.trackIds, !forAdmin);
    const albumIndex = await loadAlbumIndex();
    const bodyTracks = tracks.map((track) => {
        if (forAdmin) {
            return toManageTrack(track, albumIndex.get(String(track._id)) ?? null);
        }
        const albumId = collection.type === 'album' && collection.status === 'published'
            ? String(collection._id)
            : publicAlbumId(albumIndex, String(track._id));
        return toPublicTrack(track, albumId);
    });
    return {
        ...toCard(collection, bodyTracks.length),
        ...(forAdmin
            ? {
                status: collection.status,
                createdAt: collection.createdAt ? collection.createdAt.toISOString() : null,
                updatedAt: collection.updatedAt ? collection.updatedAt.toISOString() : null,
            }
            : {}),
        tracks: bodyTracks,
    };
};

/**
 * Вешает маршруты подборок на роутер музыки.
 * @param router Роутер /api/music
 * @param options Auth и хранилище
 */
export const registerCollectionRoutes = (
    router: express.Router,
    {
        superAdmin,
        optionalAuthenticate,
        objectStorage,
        rejectIfNoStorage,
    }: CollectionRouteOptions,
) => {
    /**
     * @route GET /api/music/catalog
     * @description Опубликованные альбомы и плейлисты и синглы без опубликованной подборки.
     */
    router.get('/catalog', async (_req, res) => {
        const [collections, tracks] = await Promise.all([
            MusicCollection.find({ status: 'published' }).sort({ publishedAt: -1, createdAt: -1 }),
            MusicTrack.find({ status: 'published' }).sort({ publishedAt: -1, createdAt: -1 }),
        ]);
        const publishedIds = new Set(tracks.map((track) => String(track._id)));
        const used = new Set<string>();
        for (const collection of collections) {
            for (const trackId of collection.trackIds) {
                used.add(String(trackId));
            }
        }
        const albumIndex = await loadAlbumIndex();
        res.json({
            collections: collections.map((collection) => (
                toCard(collection, publishedTrackCount(collection, publishedIds))
            )),
            singles: tracks
                .filter((track) => !used.has(String(track._id)))
                .map((track) => toPublicTrack(track, publicAlbumId(albumIndex, String(track._id)))),
        });
    });

    /**
     * @route GET /api/music/admin/collections
     * @description Все подборки, включая черновики и черновики записей.
     * @access super_admin
     */
    router.get('/admin/collections', ...superAdmin, async (_req, res) => {
        const collections = await MusicCollection.find().sort({ updatedAt: -1 });
        const body = await Promise.all(collections.map((collection) => presentCollection(collection, true)));
        res.json({ collections: body });
    });

    /**
     * @route POST /api/music/admin/collections
     * @description Черновик альбома или плейлиста. Обложка — отдельной правкой.
     * @access super_admin
     */
    router.post('/admin/collections', ...superAdmin, async (req, res) => {
        const text = parseCollectionText(req.body ?? {});
        if (!text.ok) {
            res.status(400).json({ message: text.message });
            return;
        }
        const type = req.body?.type === 'album' || req.body?.type === 'playlist' ? req.body.type : null;
        if (!type) {
            res.status(400).json({ message: 'Нужен тип: альбом или плейлист.' });
            return;
        }
        const collection = await MusicCollection.create({
            type,
            title: text.value.title,
            description: text.value.description,
            status: 'draft',
            trackIds: [],
            createdBy: req.dbUser!._id,
            updatedBy: req.dbUser!._id,
        });
        res.status(201).json({ collection: await presentCollection(collection, true) });
    });

    /**
     * @route GET /api/music/collections/:id
     * @description Опубликованная подборка. Черновик — 404 всем, кроме super_admin.
     */
    router.get('/collections/:id', optionalAuthenticate, async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        const collection = visibleCollection(
            await MusicCollection.findById(routeParam(req.params.id)),
            req.dbUser?.role,
        );
        if (!collection) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        const forAdmin = collection.status !== 'published' && isSuperAdmin(req.dbUser?.role);
        res.json({ collection: await presentCollection(collection, forAdmin) });
    });

    /**
     * @route PATCH /api/music/admin/collections/:id
     * @description Название, описание и необязательная новая обложка.
     * @access super_admin
     */
    router.patch('/admin/collections/:id', ...superAdmin, async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        const collection = await MusicCollection.findById(routeParam(req.params.id));
        if (!collection) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        let parsed;
        try {
            parsed = await parseMultipart(req, COVER_MAX_BYTES);
        } catch (err) {
            const tooBig = err instanceof Error && err.message === 'FILE_TOO_LARGE';
            res.status(tooBig ? 413 : 400).json({
                message: tooBig ? 'Обложка больше 2 МБ.' : 'Не удалось прочитать форму.',
            });
            return;
        }
        const text = parseCollectionText({
            title: parsed.fields.title ?? collection.title,
            description: parsed.fields.description ?? collection.description,
        });
        if (!text.ok) {
            res.status(400).json({ message: text.message });
            return;
        }
        if (parsed.fields.type && parsed.fields.type !== collection.type) {
            res.status(400).json({ message: 'Тип альбома или плейлиста не меняется.' });
            return;
        }
        let nextCover: { key: string; contentType: string; body: Buffer } | null = null;
        if (parsed.files.cover) {
            if (rejectIfNoStorage(res) || !objectStorage) {
                return;
            }
            const checked = readCover(parsed.files.cover.buffer);
            if (!checked.ok) {
                res.status(400).json({ message: checked.message });
                return;
            }
            nextCover = {
                key: collectionCoverObjectKey(String(collection._id), checked.kind.extension),
                contentType: checked.kind.contentType,
                body: parsed.files.cover.buffer,
            };
        }
        const previousCover = collection.coverKey;
        try {
            if (nextCover && objectStorage) {
                await objectStorage.put(nextCover.key, nextCover.body, nextCover.contentType);
                if (previousCover && previousCover !== nextCover.key) {
                    await objectStorage.delete(previousCover);
                }
                collection.coverKey = nextCover.key;
                collection.coverContentType = nextCover.contentType;
            }
            collection.title = text.value.title;
            collection.description = text.value.description;
            collection.updatedBy = req.dbUser!._id;
            await collection.save();
            res.json({ collection: await presentCollection(collection, true) });
        } catch (err) {
            console.error('Collection update failed:', err);
            res.status(500).json({ message: 'Не удалось обновить подборку.' });
        }
    });

    /**
     * @route PUT /api/music/admin/collections/:id/tracks
     * @description Новый порядок. В альбоме запись уходит из прежнего альбома.
     * @access super_admin
     */
    router.put('/admin/collections/:id/tracks', ...superAdmin, async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        const collection = await MusicCollection.findById(routeParam(req.params.id));
        if (!collection) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        const replaced = await replaceCollectionTracks(collection, req.body?.trackIds);
        if (!replaced.ok) {
            res.status(400).json({ message: replaced.message });
            return;
        }
        collection.updatedBy = req.dbUser!._id;
        await collection.save();
        res.json({ collection: await presentCollection(collection, true) });
    });

    /**
     * @route POST /api/music/admin/collections/:id/publish
     * @description Явная публикация.
     * @access super_admin
     */
    router.post('/admin/collections/:id/publish', ...superAdmin, async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        const collection = await MusicCollection.findById(routeParam(req.params.id));
        if (!collection) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        collection.status = 'published';
        if (!collection.publishedAt) {
            collection.publishedAt = new Date();
        }
        collection.updatedBy = req.dbUser!._id;
        await collection.save();
        res.json({ collection: await presentCollection(collection, true) });
    });

    /**
     * @route POST /api/music/admin/collections/:id/unpublish
     * @description Снова черновик.
     * @access super_admin
     */
    router.post('/admin/collections/:id/unpublish', ...superAdmin, async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        const collection = await MusicCollection.findById(routeParam(req.params.id));
        if (!collection) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        collection.status = 'draft';
        collection.publishedAt = null;
        collection.updatedBy = req.dbUser!._id;
        await collection.save();
        res.json({ collection: await presentCollection(collection, true) });
    });

    /**
     * @route DELETE /api/music/admin/collections/:id
     * @description Удаляет подборку и обложку. Записи остаются.
     * @access super_admin
     */
    router.delete('/admin/collections/:id', ...superAdmin, async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        const collection = await MusicCollection.findById(routeParam(req.params.id));
        if (!collection) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        if (objectStorage && collection.coverKey) {
            await objectStorage.delete(collection.coverKey).catch((err) => {
                console.error('Collection cover delete failed:', err);
            });
        }
        await collection.deleteOne();
        res.json({ deleted: true });
    });

    /**
     * @route GET /api/music/collections/:id/cover
     * @description Обложка. Черновик — только super_admin.
     */
    router.get('/collections/:id/cover', optionalAuthenticate, async (req, res) => {
        if (!mongoose.Types.ObjectId.isValid(routeParam(req.params.id))) {
            res.status(404).json({ message: 'Подборка не найдена.' });
            return;
        }
        const collection = visibleCollection(
            await MusicCollection.findById(routeParam(req.params.id)),
            req.dbUser?.role,
        );
        if (!collection?.coverKey) {
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
                collection.coverKey,
                collection.coverContentType || 'application/octet-stream',
                collection.status === 'published',
                'cover.jpg',
            );
        } catch (err) {
            console.error('Collection cover failed:', err);
            if (!res.headersSent) {
                res.status(500).json({ message: 'Не удалось отдать файл.' });
            }
        }
    });
};
