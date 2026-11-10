/**
 * @file S3-совместимое хранилище. Клиент создаётся только из env, без ключей в коде.
 */
import { Readable } from 'node:stream';
import {
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    NoSuchKey,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import type { ByteRange, ObjectStorage, OpenedObject } from './objectStorage';
import { isSafeObjectKey } from './objectKey';

/** Параметры бакета. Секреты приходят из окружения вызывающего кода. */
export interface S3StorageConfig {
    bucket: string;
    region: string;
    endpoint?: string;
    forcePathStyle: boolean;
    accessKeyId: string;
    secretAccessKey: string;
}

/**
 * Читает конфиг S3 из env. Неполный набор полей — null, сервер тогда отвечает 503.
 * @param env Окружение процесса
 * @returns Конфиг или null
 */
export const readS3Config = (
    env: NodeJS.ProcessEnv = process.env,
): S3StorageConfig | null => {
    const bucket = env.S3_BUCKET?.trim();
    const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
    if (!bucket || !accessKeyId || !secretAccessKey) {
        return null;
    }
    const endpoint = env.S3_ENDPOINT?.trim();
    return {
        bucket,
        region: env.S3_REGION?.trim() || 'us-east-1',
        endpoint: endpoint || undefined,
        forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
        accessKeyId,
        secretAccessKey,
    };
};

const isMissing = (err: unknown): boolean => {
    if (err instanceof NoSuchKey) {
        return true;
    }
    if (!err || typeof err !== 'object') {
        return false;
    }
    const name = 'name' in err ? String(err.name) : '';
    const code = '$metadata' in err
        ? (err.$metadata as { httpStatusCode?: number }).httpStatusCode
        : undefined;
    return name === 'NotFound' || name === 'NoSuchKey' || code === 404;
};

/**
 * Бакет остаётся приватным. Наружу файлы отдаёт наш API после проверки роли.
 */
export class S3ObjectStorage implements ObjectStorage {
    private readonly client: S3Client;

    /**
     * @param config Проверенный конфиг бакета
     */
    constructor(private readonly config: S3StorageConfig) {
        this.client = new S3Client({
            region: config.region,
            endpoint: config.endpoint,
            forcePathStyle: config.forcePathStyle,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey,
            },
        });
    }

    /**
     * @param key Серверный ключ
     * @param body Байты
     * @param contentType Проверенный MIME
     */
    async put(key: string, body: Buffer, contentType: string): Promise<void> {
        this.assertKey(key);
        await this.client.send(new PutObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
        }));
    }

    /**
     * @param key Серверный ключ
     * @param range Кусок или весь файл
     * @returns Поток и границы, либо null
     */
    async open(key: string, range?: ByteRange): Promise<OpenedObject | null> {
        this.assertKey(key);
        let total = 0;
        let contentType = 'application/octet-stream';
        try {
            const head = await this.client.send(new HeadObjectCommand({
                Bucket: this.config.bucket,
                Key: key,
            }));
            total = head.ContentLength ?? 0;
            contentType = head.ContentType || contentType;
        } catch (err) {
            if (isMissing(err)) {
                return null;
            }
            throw err;
        }
        const start = range?.start ?? 0;
        const end = range?.end ?? Math.max(0, total - 1);
        const result = await this.client.send(new GetObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            Range: total > 0 ? `bytes=${start}-${end}` : undefined,
        }));
        const body = result.Body;
        if (!body || typeof (body as Readable).pipe !== 'function') {
            return null;
        }
        return {
            stream: body as Readable,
            start,
            end: total === 0 ? 0 : end,
            total,
            contentType: result.ContentType || contentType,
        };
    }

    /**
     * @param key Серверный ключ
     */
    async delete(key: string): Promise<void> {
        this.assertKey(key);
        try {
            await this.client.send(new DeleteObjectCommand({
                Bucket: this.config.bucket,
                Key: key,
            }));
        } catch (err) {
            if (isMissing(err)) {
                return;
            }
            throw err;
        }
    }

    /**
     * @param key Ключ
     */
    private assertKey(key: string): void {
        if (!isSafeObjectKey(key)) {
            throw new Error('Invalid object key');
        }
    }
}
