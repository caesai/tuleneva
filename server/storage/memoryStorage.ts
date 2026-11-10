/**
 * @file Память вместо диска: тесты и локальный прогон без бакета.
 */
import { Readable } from 'node:stream';
import type { ByteRange, ObjectStorage, OpenedObject } from './objectStorage';
import { isSafeObjectKey } from './objectKey';

interface StoredBlob {
    body: Buffer;
    contentType: string;
}

/**
 * Хранит объекты в Map. Не переживает перезапуск процесса.
 */
export class MemoryObjectStorage implements ObjectStorage {
    private readonly objects = new Map<string, StoredBlob>();

    /**
     * @param key Серверный ключ
     * @param body Байты
     * @param contentType Проверенный MIME
     */
    async put(key: string, body: Buffer, contentType: string): Promise<void> {
        this.assertKey(key);
        this.objects.set(key, { body: Buffer.from(body), contentType });
    }

    /**
     * @param key Серверный ключ
     * @param range Кусок или весь файл
     * @returns Поток и границы, либо null
     */
    async open(key: string, range?: ByteRange): Promise<OpenedObject | null> {
        this.assertKey(key);
        const stored = this.objects.get(key);
        if (!stored) {
            return null;
        }
        const total = stored.body.length;
        const start = range?.start ?? 0;
        const end = range?.end ?? Math.max(0, total - 1);
        const slice = total === 0 ? Buffer.alloc(0) : stored.body.subarray(start, end + 1);
        return {
            stream: Readable.from(slice),
            start,
            end: total === 0 ? 0 : end,
            total,
            contentType: stored.contentType,
        };
    }

    /**
     * @param key Серверный ключ
     */
    async delete(key: string): Promise<void> {
        this.assertKey(key);
        this.objects.delete(key);
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
