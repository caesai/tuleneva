/**
 * @file HTML /music для краулеров. SPA остаётся в body, head берётся из Mongo.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Express, Request, Response } from 'express';
import mongoose from 'mongoose';
import {
    injectPageMeta,
    renderHtmlPageMeta,
    type HtmlPageMeta,
} from '../../shared/pageMetaHtml';
import MusicCollection from '../models/MusicCollection';
import MusicTrack from '../models/MusicTrack';
import { storedMediaVersion } from '../music/mediaVersion';
import { SHARE_HEIGHT, SHARE_WIDTH } from './shareImage';

/** Заголовок каталога. Совпадает с MUSIC_PAGE_META на клиенте. */
const MUSIC_TITLE = 'Музыка — Тюленева 25';

/** Описание каталога и запасной вариант для неизвестных id. */
const MUSIC_DESCRIPTION = 'Записи музыкальной студии «Тюленева 25». Можно слушать без входа.';

const SITE_NAME = 'Тюленева 25';

interface IndexCache {
    filePath: string;
    mtimeMs: number;
    html: string;
}

let indexCache: IndexCache | null = null;

/**
 * Путь к собранному index.html. cwd API на VPS — current/server.
 * @returns Абсолютный путь
 */
export const defaultIndexHtmlPath = (): string => path.resolve(process.cwd(), '../dist/index.html');

/**
 * Читает index.html и держит его в памяти, пока не сменится mtime.
 * @param filePath Путь к файлу
 * @returns Содержимое
 */
export const readIndexHtml = (filePath: string): string => {
    const stat = fs.statSync(filePath);
    if (indexCache && indexCache.filePath === filePath && indexCache.mtimeMs === stat.mtimeMs) {
        return indexCache.html;
    }
    const html = fs.readFileSync(filePath, 'utf8');
    indexCache = { filePath, mtimeMs: stat.mtimeMs, html };
    return html;
};

/**
 * Сбрасывает кэш index.html. Нужен тестам, которые меняют файл.
 */
export const clearIndexHtmlCache = (): void => {
    indexCache = null;
};

/**
 * Origin без завершающего слэша.
 * @param webAppBaseUrl Базовый URL из настроек приложения
 * @returns Origin
 */
const originOf = (webAppBaseUrl: string): string => webAppBaseUrl.replace(/\/+$/, '');

/**
 * Каркас meta каталога /music.
 * @param origin Продакшен-origin
 * @returns Meta без данных конкретной подборки
 */
const musicCatalogMeta = (origin: string): HtmlPageMeta => ({
    title: MUSIC_TITLE,
    description: MUSIC_DESCRIPTION,
    canonicalUrl: `${origin}/music`,
    ogType: 'website',
    locale: 'ru_RU',
    siteName: SITE_NAME,
    robots: 'index, follow',
    imageUrl: `${origin}/og-share.jpg`,
    imageWidth: SHARE_WIDTH,
    imageHeight: SHARE_HEIGHT,
    imageAlt: 'Тюленева 25 — музыка',
    twitterCard: 'summary_large_image',
});

/**
 * Meta опубликованной подборки. Черновик и чужой тип дают каталог.
 * @param origin Продакшен-origin
 * @param id Параметр маршрута
 * @param type album или playlist
 * @returns Meta страницы
 */
const collectionMeta = async (
    origin: string,
    id: string,
    type: 'album' | 'playlist',
): Promise<HtmlPageMeta> => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return musicCatalogMeta(origin);
    }
    const doc = await MusicCollection.findById(id);
    if (!doc || doc.status !== 'published' || doc.type !== type) {
        return musicCatalogMeta(origin);
    }
    const kind = type === 'album' ? 'Альбом' : 'Плейлист';
    const description = doc.description.trim()
        || `${kind} «${doc.title}». Записи студии «Тюленева 25».`;
    const imageUrl = doc.coverKey
        ? `${origin}/api/music/collections/${doc._id.toString()}/og.jpg?v=${storedMediaVersion(doc.coverVersion)}`
        : `${origin}/og-share.jpg`;
    return {
        title: `${doc.title} — ${SITE_NAME}`,
        description,
        canonicalUrl: `${origin}/music/${type}/${doc._id.toString()}`,
        ogType: type === 'album' ? 'music.album' : 'music.playlist',
        locale: 'ru_RU',
        siteName: SITE_NAME,
        robots: 'index, follow',
        imageUrl,
        imageWidth: SHARE_WIDTH,
        imageHeight: SHARE_HEIGHT,
        imageAlt: doc.title,
        twitterCard: 'summary_large_image',
        extra: [{ property: 'music:musician', content: SITE_NAME }],
    };
};

/**
 * Meta опубликованной записи. Иначе каталог, чтобы /music/:id не стал 404.
 * @param origin Продакшен-origin
 * @param id Параметр маршрута
 * @returns Meta страницы
 */
const trackMeta = async (origin: string, id: string): Promise<HtmlPageMeta> => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return musicCatalogMeta(origin);
    }
    const track = await MusicTrack.findById(id);
    if (!track || track.status !== 'published') {
        return musicCatalogMeta(origin);
    }
    const description = track.description.trim()
        || track.credits.trim()
        || `Запись «${track.title}». Студия «Тюленева 25».`;
    const imageUrl = track.coverKey
        ? `${origin}/api/music/tracks/${track._id.toString()}/og.jpg?v=${storedMediaVersion(track.coverVersion)}`
        : `${origin}/og-share.jpg`;
    return {
        title: `${track.title} — ${SITE_NAME}`,
        description,
        canonicalUrl: `${origin}/music/${track._id.toString()}`,
        ogType: 'music.song',
        locale: 'ru_RU',
        siteName: SITE_NAME,
        robots: 'index, follow',
        imageUrl,
        imageWidth: SHARE_WIDTH,
        imageHeight: SHARE_HEIGHT,
        imageAlt: track.title,
        twitterCard: 'summary_large_image',
        extra: [{ property: 'music:musician', content: SITE_NAME }],
    };
};

interface MusicHtmlOptions {
    /** Origin для canonical и og:url. */
    webAppBaseUrl: string;
    /** Готовый HTML вместо файла. Так устроены тесты. */
    indexHtml?: string;
    /** Путь к dist/index.html. */
    indexHtmlPath?: string;
}

/**
 * Отдаёт index.html с подменённым head. Неизвестный id — 200 и meta каталога.
 * @param app Приложение Express
 * @param options Origin и источник HTML
 */
export const registerMusicHtmlRoutes = (app: Express, options: MusicHtmlOptions): void => {
    const origin = originOf(options.webAppBaseUrl);
    const indexHtmlPath = options.indexHtmlPath ?? defaultIndexHtmlPath();

    const send = async (req: Request, res: Response, meta: HtmlPageMeta) => {
        let html = options.indexHtml;
        if (html === undefined) {
            try {
                html = readIndexHtml(indexHtmlPath);
            } catch (err) {
                console.error('index.html for /music is missing:', err);
                res.status(500).type('text/plain').send('index.html is missing');
                return;
            }
        }
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.type('html').send(injectPageMeta(html, renderHtmlPageMeta(meta)));
    };

    /**
     * @route GET /music
     * @description Каталог: общий title и og:image 1200×630.
     */
    app.get('/music', (req, res) => {
        send(req, res, musicCatalogMeta(origin)).catch((err) => {
            console.error('Music HTML failed:', err);
            if (!res.headersSent) {
                res.status(500).type('text/plain').send('music html failed');
            }
        });
    });

    /**
     * @route GET /music/album/:id
     * @description Опубликованный альбом. Черновик и неизвестный id — meta каталога, HTTP 200.
     */
    app.get('/music/album/:id', (req, res) => {
        const id = String(req.params.id);
        collectionMeta(origin, id, 'album')
            .then((meta) => send(req, res, meta))
            .catch((err) => {
                console.error('Album HTML failed:', err);
                if (!res.headersSent) {
                    res.status(500).type('text/plain').send('music html failed');
                }
            });
    });

    /**
     * @route GET /music/playlist/:id
     * @description Опубликованный плейлист. Черновик и неизвестный id — meta каталога, HTTP 200.
     */
    app.get('/music/playlist/:id', (req, res) => {
        const id = String(req.params.id);
        collectionMeta(origin, id, 'playlist')
            .then((meta) => send(req, res, meta))
            .catch((err) => {
                console.error('Playlist HTML failed:', err);
                if (!res.headersSent) {
                    res.status(500).type('text/plain').send('music html failed');
                }
            });
    });

    /**
     * @route GET /music/:trackId
     * @description Страница записи. Неопубликованная — meta каталога, HTTP 200, чтобы SPA открылась.
     */
    app.get('/music/:trackId', (req, res) => {
        const id = String(req.params.trackId);
        trackMeta(origin, id)
            .then((meta) => send(req, res, meta))
            .catch((err) => {
                console.error('Track HTML failed:', err);
                if (!res.headersSent) {
                    res.status(500).type('text/plain').send('music html failed');
                }
            });
    });
};
