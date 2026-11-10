/**
 * @file Проверка MP3, обложки и текста. MIME клиента не доверяем.
 */
import {
    COVER_MAX_BYTES,
    CREDITS_MAX,
    DESCRIPTION_MAX,
    TITLE_MAX,
} from './musicLimits';

export type CoverKind = {
    extension: 'jpg' | 'png' | 'webp';
    contentType: 'image/jpeg' | 'image/png' | 'image/webp';
};

/**
 * Снимает пробелы и нулевые байты.
 * @param value Сырое поле
 * @returns Очищенная строка
 */
const cleanText = (value: unknown): string =>
    String(value ?? '').replace(/\0/g, '').trim();

/**
 * Похоже ли начало файла на MP3 (ID3 или синхрокадр).
 * @param body Байты
 * @returns true для допустимого MP3
 */
export const isMp3 = (body: Buffer): boolean => {
    if (body.length < 16) {
        return false;
    }
    if (body.subarray(0, 3).toString('ascii') === 'ID3') {
        return true;
    }
    return body[0] === 0xff && (body[1] & 0xe0) === 0xe0;
};

/**
 * Определяет обложку по сигнатуре.
 * @param body Байты
 * @returns Формат или null
 */
export const detectCover = (body: Buffer): CoverKind | null => {
    if (body.length < 12 || body.length > COVER_MAX_BYTES) {
        return null;
    }
    if (body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) {
        return { extension: 'jpg', contentType: 'image/jpeg' };
    }
    if (body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47) {
        return { extension: 'png', contentType: 'image/png' };
    }
    if (
        body.subarray(0, 4).toString('ascii') === 'RIFF'
        && body.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
        return { extension: 'webp', contentType: 'image/webp' };
    }
    return null;
};

/** Слишком большой файл обложки. */
export const COVER_TOO_BIG_MESSAGE = 'Обложка больше 2 МБ. Выберите фото ещё раз — страница сожмёт его, если браузер его откроет.';

/** Файл не JPEG, PNG и не WebP. */
export const COVER_BAD_TYPE_MESSAGE = 'Обложка должна быть фотографией JPEG, PNG или WebP.';

/**
 * Проверяет обложку и объясняет отказ по-русски.
 * Размер проверяется отдельно от сигнатуры: телефон часто присылает HEIC или JPEG больше 2 МБ.
 * @param body Байты файла
 * @returns Формат или сообщение для клиента
 */
export const readCover = (
    body: Buffer,
): { ok: true; kind: CoverKind } | { ok: false; message: string } => {
    if (body.length > COVER_MAX_BYTES) {
        return { ok: false, message: COVER_TOO_BIG_MESSAGE };
    }
    const kind = detectCover(body);
    if (!kind) {
        return { ok: false, message: COVER_BAD_TYPE_MESSAGE };
    }
    return { ok: true, kind };
};

export interface MusicText {
    title: string;
    credits: string;
    description: string;
}

/**
 * Проверяет название, авторов и описание.
 * @param input Поля формы
 * @returns Текст или сообщение об ошибке
 */
export const parseMusicText = (input: {
    title?: unknown;
    credits?: unknown;
    description?: unknown;
}): { ok: true; value: MusicText } | { ok: false; message: string } => {
    const title = cleanText(input.title);
    const credits = cleanText(input.credits);
    const description = cleanText(input.description);
    if (!title || title.length > TITLE_MAX) {
        return { ok: false, message: `Название нужно, и оно короче ${TITLE_MAX + 1} символов.` };
    }
    if (!credits || credits.length > CREDITS_MAX) {
        return { ok: false, message: `Укажите, кто играет. До ${CREDITS_MAX} символов.` };
    }
    if (description.length > DESCRIPTION_MAX) {
        return { ok: false, message: `Описание короче ${DESCRIPTION_MAX + 1} символов.` };
    }
    return { ok: true, value: { title, credits, description } };
};

/**
 * Проверяет название и описание альбома или плейлиста.
 * @param input Поля
 * @returns Текст или сообщение об ошибке
 */
export const parseCollectionText = (input: {
    title?: unknown;
    description?: unknown;
}): { ok: true; value: { title: string; description: string } } | { ok: false; message: string } => {
    const title = cleanText(input.title);
    const description = cleanText(input.description);
    if (!title || title.length > TITLE_MAX) {
        return { ok: false, message: `Название нужно, и оно короче ${TITLE_MAX + 1} символов.` };
    }
    if (description.length > DESCRIPTION_MAX) {
        return { ok: false, message: `Описание короче ${DESCRIPTION_MAX + 1} символов.` };
    }
    return { ok: true, value: { title, description } };
};
