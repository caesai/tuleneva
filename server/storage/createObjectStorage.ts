/**
 * @file Выбор адаптера хранилища по env. Провайдер и бакет здесь не создаются.
 */
import os from 'node:os';
import path from 'node:path';
import type { ObjectStorage } from './objectStorage';
import { LocalObjectStorage } from './localStorage';
import { readS3Config, S3ObjectStorage } from './s3Storage';

/**
 * Собирает хранилище из окружения.
 * В production без явного драйвера возвращает null: загрузка ответит 503,
 * а не запишет файлы «куда-нибудь».
 * Вне production пустой драйвер — временный локальный каталог.
 * @param env Окружение
 * @returns Адаптер или null, если хранилище не настроено
 */
export const createObjectStorageFromEnv = (
    env: NodeJS.ProcessEnv = process.env,
): ObjectStorage | null => {
    const driver = (env.OBJECT_STORAGE_DRIVER || '').trim().toLowerCase();
    if (driver === 'none') {
        return null;
    }
    if (driver === 's3') {
        const config = readS3Config(env);
        if (!config) {
            return null;
        }
        return new S3ObjectStorage(config);
    }
    if (driver === 'local' || (driver === '' && env.NODE_ENV !== 'production')) {
        const dir = env.OBJECT_STORAGE_LOCAL_DIR?.trim()
            || path.join(os.tmpdir(), 'tuleneva-media');
        return new LocalObjectStorage(dir);
    }
    return null;
};
