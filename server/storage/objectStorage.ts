/**
 * @file Хранилище медиа. В Mongo только ключи, сами байты — здесь.
 */
import type { Readable } from 'node:stream';

/** Диапазон байтов включительно, как в HTTP Range. */
export interface ByteRange {
    start: number;
    end: number;
}

/** Открытый объект для ответа с поддержкой Range. */
export interface OpenedObject {
    stream: Readable;
    start: number;
    end: number;
    total: number;
    contentType: string;
}

/**
 * Адаптер объектного хранилища (локальный диск, память, S3).
 * Ключи задаёт сервер. Реализация не должна принимать пути от клиента.
 */
export interface ObjectStorage {
    /**
     * Кладёт объект целиком.
     * @param key Серверный ключ
     * @param body Байты
     * @param contentType MIME, который мы проверили сами
     */
    put(key: string, body: Buffer, contentType: string): Promise<void>;

    /**
     * Открывает объект целиком или кусок.
     * @param key Серверный ключ
     * @param range Диапазон или весь файл
     * @returns null, если объекта нет
     */
    open(key: string, range?: ByteRange): Promise<OpenedObject | null>;

    /**
     * Удаляет объект. Отсутствие ключа не ошибка.
     * @param key Серверный ключ
     */
    delete(key: string): Promise<void>;
}
