/**
 * @file Каталог музыки, публикация и статистика прослушиваний.
 * Черновики и сводку пишет и читает только super_admin. События /music шлёт страница сама.
 */
import type {
    IMusicCatalog,
    IMusicCollection,
    IMusicStats,
    IMusicTrack,
    TMusicCollectionType,
} from '@/types/music.types.ts';

/**
 * Заголовок Authorization без Content-Type, чтобы браузер сам выставил multipart.
 * @returns Заголовки или пустой объект
 */
const authOnly = (): HeadersInit => {
    const token = localStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Опубликованные записи. Без входа.
 * @returns Список
 */
export const fetchPublishedTracks = async (): Promise<IMusicTrack[]> => {
    const response = await fetch('/api/music/tracks');
    if (!response.ok) {
        throw new Error('Не удалось загрузить музыку.');
    }
    const data = await response.json() as { tracks: IMusicTrack[] };
    return data.tracks;
};

/**
 * Сводка прослушиваний. Только супер-админ.
 * @returns Счётчики за 7 дней и за всё время
 */
export const fetchMusicStats = async (): Promise<IMusicStats> => {
    const response = await fetch('/api/music/admin/stats', { headers: authOnly() });
    if (!response.ok) {
        const error = new Error('Не удалось загрузить статистику.') as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
    return response.json() as Promise<IMusicStats>;
};

/**
 * Все записи студии, включая черновики.
 * @returns Список для супер-админа
 */
export const fetchManageTracks = async (): Promise<IMusicTrack[]> => {
    const response = await fetch('/api/music/admin/tracks', { headers: authOnly() });
    if (!response.ok) {
        const error = new Error('Не удалось загрузить записи.') as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
    const data = await response.json() as { tracks: IMusicTrack[] };
    return data.tracks;
};

/**
 * `?v=` для кэша. Нет номера у старого ответа — ноль, файл всё равно открывается.
 * @param version audioVersion или coverVersion
 * @returns Хвост query
 */
const mediaVersionQuery = (version?: number | null): string => {
    const value = typeof version === 'number' && Number.isInteger(version) && version >= 0 ? version : 0;
    return `v=${value}`;
};

/**
 * URL MP3. Для черновика браузерный плеер без JWT получит 404:
 * предпросмотр черновика качает файл через {@link fetchTrackBlob}.
 * @param id Идентификатор записи
 * @param version audioVersion. Нет поля — 0
 * @returns Путь с версией байтов
 */
export const trackAudioUrl = (id: string, version?: number | null): string => (
    `/api/music/tracks/${id}/audio?${mediaVersionQuery(version)}`
);

/**
 * URL обложки записи.
 * @param id Идентификатор записи
 * @param version coverVersion. Нет поля — 0
 * @returns Путь с версией байтов
 */
export const trackCoverUrl = (id: string, version?: number | null): string => (
    `/api/music/tracks/${id}/cover?${mediaVersionQuery(version)}`
);

/**
 * Обложка альбома или плейлиста.
 * @param id Идентификатор подборки
 * @param version coverVersion. Нет поля — 0
 * @returns Путь с версией байтов
 */
export const collectionCoverUrl = (id: string, version?: number | null): string => (
    `/api/music/collections/${id}/cover?${mediaVersionQuery(version)}`
);

/**
 * Опубликованные подборки и синглы. Без входа.
 * @returns Каталог
 */
export const fetchMusicCatalog = async (): Promise<IMusicCatalog> => {
    const response = await fetch('/api/music/catalog');
    if (!response.ok) {
        throw new Error('Не удалось загрузить музыку.');
    }
    return response.json() as Promise<IMusicCatalog>;
};

/**
 * Одна опубликованная запись. 404 — её нет или она ещё черновик.
 * @param id Идентификатор
 * @returns Запись или null
 */
export const fetchPublishedTrack = async (id: string): Promise<IMusicTrack | null> => {
    const response = await fetch(`/api/music/tracks/${id}`);
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        throw new Error('Не удалось загрузить запись.');
    }
    const data = await response.json() as { track: IMusicTrack };
    return data.track;
};

/**
 * Опубликованная подборка и записи по порядку. Черновик для гостя — ошибка 404.
 * @param id Идентификатор
 * @returns Подборка
 */
export const fetchCollection = async (id: string): Promise<IMusicCollection> => {
    const response = await fetch(`/api/music/collections/${id}`);
    if (response.status === 404) {
        throw new Error('Подборка не найдена или ещё не опубликована.');
    }
    if (!response.ok) {
        throw new Error('Не удалось загрузить подборку.');
    }
    const data = await response.json() as { collection: IMusicCollection };
    return data.collection;
};

/**
 * Скачивает файл с JWT и отдаёт blob-URL. Вызывающий код делает revoke.
 * @param path Путь /api/music/...
 * @returns Object URL
 */
export const fetchTrackBlob = async (path: string): Promise<string> => {
    const response = await fetch(path, { headers: authOnly() });
    if (!response.ok) {
        throw new Error('Не удалось открыть файл.');
    }
    const blob = await response.blob();
    return URL.createObjectURL(blob);
};

/**
 * Читает сообщение об ошибке API.
 * 413 (прокси оборвал слишком большое тело) не содержит JSON — для него свой текст.
 * @param response Ответ
 * @param fallback Текст, если тела нет
 * @returns Сообщение
 */
const readError = async (response: Response, fallback: string): Promise<string> => {
    if (response.status === 413) {
        return 'Файл слишком большой для загрузки. Выберите обложку ещё раз — страница сожмёт фото перед отправкой.';
    }
    const data = await response.json().catch(() => ({})) as { message?: string };
    return data.message || fallback;
};

/**
 * Сохраняет черновик.
 * @param body Форма: title, credits, description, audio, cover
 * @returns Созданная запись
 */
export const createMusicDraft = async (body: FormData): Promise<IMusicTrack> => {
    const response = await fetch('/api/music/tracks', {
        method: 'POST',
        headers: authOnly(),
        body,
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось сохранить черновик.'));
    }
    const data = await response.json() as { track: IMusicTrack };
    return data.track;
};

/**
 * Обновляет текст и файлы.
 * @param id Идентификатор
 * @param body Форма
 * @returns Обновлённая запись
 */
export const updateMusicTrack = async (id: string, body: FormData): Promise<IMusicTrack> => {
    const response = await fetch(`/api/music/tracks/${id}`, {
        method: 'PATCH',
        headers: authOnly(),
        body,
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось сохранить правки.'));
    }
    const data = await response.json() as { track: IMusicTrack };
    return data.track;
};

/**
 * Публикует черновик.
 * @param id Идентификатор
 * @returns Опубликованная запись
 */
export const publishMusicTrack = async (id: string): Promise<IMusicTrack> => {
    const response = await fetch(`/api/music/tracks/${id}/publish`, {
        method: 'POST',
        headers: authOnly(),
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось опубликовать.'));
    }
    const data = await response.json() as { track: IMusicTrack };
    return data.track;
};

/**
 * Снимает запись с публикации.
 * @param id Идентификатор
 * @returns Черновик
 */
export const unpublishMusicTrack = async (id: string): Promise<IMusicTrack> => {
    const response = await fetch(`/api/music/tracks/${id}/unpublish`, {
        method: 'POST',
        headers: authOnly(),
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось снять с публикации.'));
    }
    const data = await response.json() as { track: IMusicTrack };
    return data.track;
};

/**
 * Удаляет запись и файлы.
 * @param id Идентификатор
 */
/**
 * Все подборки, включая черновики.
 * @returns Список для супер-админа
 */
export const fetchManageCollections = async (): Promise<IMusicCollection[]> => {
    const response = await fetch('/api/music/admin/collections', { headers: authOnly() });
    if (!response.ok) {
        const error = new Error('Не удалось загрузить подборки.') as Error & { status?: number };
        error.status = response.status;
        throw error;
    }
    const data = await response.json() as { collections: IMusicCollection[] };
    return data.collections;
};

/**
 * Черновик альбома или плейлиста без обложки.
 * @param body Тип, название и описание
 * @returns Созданная подборка
 */
export const createCollection = async (body: {
    type: TMusicCollectionType;
    title: string;
    description?: string;
}): Promise<IMusicCollection> => {
    const response = await fetch('/api/music/admin/collections', {
        method: 'POST',
        headers: {
            ...authOnly(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось создать подборку.'));
    }
    const data = await response.json() as { collection: IMusicCollection };
    return data.collection;
};

/**
 * Название, описание и обложка.
 * @param id Идентификатор
 * @param body Форма
 * @returns Обновлённая подборка
 */
export const updateCollection = async (id: string, body: FormData): Promise<IMusicCollection> => {
    const response = await fetch(`/api/music/admin/collections/${id}`, {
        method: 'PATCH',
        headers: authOnly(),
        body,
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось сохранить подборку.'));
    }
    const data = await response.json() as { collection: IMusicCollection };
    return data.collection;
};

/**
 * Заменяет состав и порядок.
 * @param id Подборка
 * @param trackIds Записи сверху вниз
 * @returns Подборка
 */
export const setCollectionTracks = async (
    id: string,
    trackIds: string[],
): Promise<IMusicCollection> => {
    const response = await fetch(`/api/music/admin/collections/${id}/tracks`, {
        method: 'PUT',
        headers: {
            ...authOnly(),
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trackIds }),
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось сохранить порядок.'));
    }
    const data = await response.json() as { collection: IMusicCollection };
    return data.collection;
};

/**
 * Публикует подборку.
 * @param id Идентификатор
 * @returns Подборка
 */
export const publishCollection = async (id: string): Promise<IMusicCollection> => {
    const response = await fetch(`/api/music/admin/collections/${id}/publish`, {
        method: 'POST',
        headers: authOnly(),
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось опубликовать подборку.'));
    }
    const data = await response.json() as { collection: IMusicCollection };
    return data.collection;
};

/**
 * Снимает подборку с публикации.
 * @param id Идентификатор
 * @returns Черновик
 */
export const unpublishCollection = async (id: string): Promise<IMusicCollection> => {
    const response = await fetch(`/api/music/admin/collections/${id}/unpublish`, {
        method: 'POST',
        headers: authOnly(),
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось снять подборку.'));
    }
    const data = await response.json() as { collection: IMusicCollection };
    return data.collection;
};

/**
 * Удаляет подборку. Записи остаются.
 * @param id Идентификатор
 */
export const deleteCollection = async (id: string): Promise<void> => {
    const response = await fetch(`/api/music/admin/collections/${id}`, {
        method: 'DELETE',
        headers: authOnly(),
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось удалить подборку.'));
    }
};

/**
 * Удаляет запись и файлы.
 * @param id Идентификатор
 */
export const deleteMusicTrack = async (id: string): Promise<void> => {
    const response = await fetch(`/api/music/tracks/${id}`, {
        method: 'DELETE',
        headers: authOnly(),
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось удалить запись.'));
    }
};
