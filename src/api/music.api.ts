/**
 * @file Каталог музыки и публикация. Черновики пишет только super_admin.
 */
import type { IMusicTrack } from '@/types/music.types.ts';

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
 * URL MP3. Для черновика браузерный плеер без JWT получит 404:
 * предпросмотр черновика качает файл через {@link fetchTrackBlob}.
 * @param id Идентификатор записи
 * @returns Путь
 */
export const trackAudioUrl = (id: string): string => `/api/music/tracks/${id}/audio`;

/**
 * URL обложки.
 * @param id Идентификатор записи
 * @returns Путь
 */
export const trackCoverUrl = (id: string): string => `/api/music/tracks/${id}/cover`;

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
export const deleteMusicTrack = async (id: string): Promise<void> => {
    const response = await fetch(`/api/music/tracks/${id}`, {
        method: 'DELETE',
        headers: authOnly(),
    });
    if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось удалить запись.'));
    }
};
