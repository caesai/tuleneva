/**
 * @file Локальное хранилище не выпускает ключ из каталога. S3 без секретов не включается.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LocalObjectStorage } from '../../storage/localStorage';
import { createObjectStorageFromEnv } from '../../storage/createObjectStorage';
import { readS3Config } from '../../storage/s3Storage';
import { audioObjectKey } from '../../storage/objectKey';

describe('object storage', () => {
    it('пишет и отдаёт диапазон на диске', async () => {
        const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tuleneva-media-'));
        const storage = new LocalObjectStorage(dir);
        const key = audioObjectKey('a'.repeat(24));
        await storage.put(key, Buffer.from('0123456789'), 'audio/mpeg');
        const opened = await storage.open(key, { start: 2, end: 4 });
        const chunks: Buffer[] = [];
        for await (const chunk of opened!.stream) {
            chunks.push(Buffer.from(chunk));
        }
        expect(Buffer.concat(chunks).toString()).toBe('234');
        expect(opened?.total).toBe(10);
        await storage.delete(key);
        expect(await storage.open(key)).toBeNull();
    });

    it('отвергает ключ с выходом из каталога', async () => {
        const storage = new LocalObjectStorage(os.tmpdir());
        await expect(storage.put('../secret.mp3', Buffer.from('x'), 'audio/mpeg')).rejects.toThrow(
            /Invalid object key/,
        );
    });

    it('в production без драйвера хранилище выключено', () => {
        expect(createObjectStorageFromEnv({ NODE_ENV: 'production' })).toBeNull();
        expect(readS3Config({ OBJECT_STORAGE_DRIVER: 's3', S3_BUCKET: 'b' })).toBeNull();
        expect(readS3Config({
            S3_BUCKET: 'studio',
            S3_ACCESS_KEY_ID: 'key',
            S3_SECRET_ACCESS_KEY: 'secret',
            S3_REGION: 'eu-central-1',
        })?.bucket).toBe('studio');
    });
});
