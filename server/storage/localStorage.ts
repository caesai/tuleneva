/**
 * @file Локальный диск для разработки. В проде нужен S3-совместимый бакет.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ByteRange, ObjectStorage, OpenedObject } from './objectStorage';
import { isSafeObjectKey } from './objectKey';

/**
 * Файлы под корневым каталогом. Ключ с `..` не принимается.
 */
export class LocalObjectStorage implements ObjectStorage {
    /**
     * @param rootDir Абсолютный или относительный корень. Создаётся при записи.
     */
    constructor(private readonly rootDir: string) {}

    /**
     * @param key Серверный ключ
     * @param body Байты
     * @param contentType MIME рядом с файлом, в `.meta.json` не пишем: тип знает Mongo
     */
    async put(key: string, body: Buffer, contentType: string): Promise<void> {
        const full = this.resolve(key);
        await fsp.mkdir(path.dirname(full), { recursive: true });
        await fsp.writeFile(full, body);
        await fsp.writeFile(`${full}.type`, contentType, 'utf8');
    }

    /**
     * @param key Серверный ключ
     * @param range Кусок или весь файл
     * @returns Поток и границы, либо null
     */
    async open(key: string, range?: ByteRange): Promise<OpenedObject | null> {
        const full = this.resolve(key);
        let stat: fs.Stats;
        try {
            stat = await fsp.stat(full);
        } catch {
            return null;
        }
        const total = stat.size;
        const start = range?.start ?? 0;
        const end = range?.end ?? Math.max(0, total - 1);
        const stream = fs.createReadStream(full, total === 0 ? undefined : { start, end });
        let contentType = 'application/octet-stream';
        try {
            contentType = (await fsp.readFile(`${full}.type`, 'utf8')).trim() || contentType;
        } catch {
            // Тип всё равно продублирован в Mongo и подставляется маршрутом.
        }
        return {
            stream,
            start,
            end: total === 0 ? 0 : end,
            total,
            contentType,
        };
    }

    /**
     * @param key Серверный ключ
     */
    async delete(key: string): Promise<void> {
        const full = this.resolve(key);
        await fsp.rm(full, { force: true });
        await fsp.rm(`${full}.type`, { force: true });
    }

    /**
     * Резолвит ключ внутрь корня.
     * @param key Серверный ключ
     * @returns Абсолютный путь
     */
    private resolve(key: string): string {
        if (!isSafeObjectKey(key)) {
            throw new Error('Invalid object key');
        }
        const root = path.resolve(this.rootDir);
        const full = path.resolve(root, key);
        if (full !== root && !full.startsWith(root + path.sep)) {
            throw new Error('Invalid object key');
        }
        return full;
    }
}
