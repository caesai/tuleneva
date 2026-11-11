/**
 * @file Анонимные события публичной /music и те же цели в Яндекс Метрике.
 * Сессия — случайный id в localStorage. Метка источника живёт до закрытия вкладки.
 * IP на клиенте нет и на сервер он не отправляется.
 */
import { YANDEX_METRIKA_COUNTER_ID } from '@/config/metrika.ts';
import {
    MUSIC_EVENT_DEDUPE_MS,
    MUSIC_SHARE_SOURCE,
    type MusicEventType,
    sanitizeMusicSource,
} from '../../shared/musicListen.ts';

const SESSION_KEY = 'tuleneva:music-session';
const SOURCE_KEY = 'tuleneva:music-source';
const DEDUPE_KEY = 'tuleneva:music-dedupe';

/** Куда отнести прослушивание или шаринг. */
export interface ListenTarget {
    /** Запись. Для шаринга альбома или плейлиста может не быть. */
    trackId?: string | null;
    /** Альбом, если слушатель был в нём или запись в нём живёт. */
    albumId?: string | null;
    /** Плейлист, если звук шёл со страницы плейлиста. */
    playlistId?: string | null;
}

interface MetrikaWindow {
    ym?: (
        counterId: number,
        method: 'reachGoal',
        goal: string,
        params?: Record<string, string>,
    ) => void;
}

let memorySession: string | null = null;
let memorySource: string | null = null;
let memoryDedupe: Record<string, number> = {};

/**
 * Случайный id вкладки браузера, стабильный между перезагрузками.
 * @returns UUID
 */
const randomId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
        const rand = Math.floor(Math.random() * 16);
        const value = char === 'x' ? rand : ((rand & 0x3) | 0x8);
        return value.toString(16);
    });
};

/**
 * Читает хранилище. В приватном режиме браузер может бросить.
 * @param store localStorage или sessionStorage
 * @param key Ключ
 * @returns Строка или null
 */
const readStorage = (store: Storage, key: string): string | null => {
    try {
        return store.getItem(key);
    } catch {
        return null;
    }
};

/**
 * Пишет хранилище и молчит, если оно закрыто.
 * @param store localStorage или sessionStorage
 * @param key Ключ
 * @param value Значение
 */
const writeStorage = (store: Storage, key: string, value: string): void => {
    try {
        store.setItem(key, value);
    } catch {
        // Хранилище закрыто — остаётся память вкладки.
    }
};

/**
 * Анонимный id этой браузерной установки. Не пользователь и не адрес.
 * @returns UUID сессии
 */
export const getMusicSessionId = (): string => {
    const stored = readStorage(localStorage, SESSION_KEY);
    if (stored) {
        return stored;
    }
    if (!memorySession) {
        memorySession = randomId();
    }
    writeStorage(localStorage, SESSION_KEY, memorySession);
    return memorySession;
};

/**
 * Запоминает `from` или, если его нет, `utm_source`, на время вкладки.
 * Пустой или грязный параметр прежнюю метку не стирает.
 * @param search Query страницы, с `?` или без
 */
export const captureListenSource = (search: string): void => {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const tag = sanitizeMusicSource(params.get('from'))
        ?? sanitizeMusicSource(params.get('utm_source'));
    if (!tag) {
        return;
    }
    memorySource = tag;
    writeStorage(sessionStorage, SOURCE_KEY, tag);
};

/**
 * Метка, с которой открыли вкладку.
 * Память вкладки используется только если sessionStorage закрыт.
 * @returns Метка или null
 */
export const readListenSource = (): string | null => {
    try {
        return sanitizeMusicSource(sessionStorage.getItem(SOURCE_KEY));
    } catch {
        return memorySource;
    }
};

/**
 * Добавляет `from=share` к адресу, которым делятся.
 * @param url Абсолютный адрес страницы
 * @returns Тот же адрес с меткой
 */
export const withShareSource = (url: string): string => {
    try {
        const parsed = new URL(url);
        parsed.searchParams.set('from', MUSIC_SHARE_SOURCE);
        return parsed.toString();
    } catch {
        return url;
    }
};

/**
 * Ключ дедупликации. Прослушивание — по записи, шаринг — по всем целям.
 * @param type Событие
 * @param target Цели
 * @returns Ключ окна
 */
const dedupeKey = (type: MusicEventType, target: ListenTarget): string => {
    if (type === 'share') {
        return `share:${target.trackId ?? ''}:${target.albumId ?? ''}:${target.playlistId ?? ''}`;
    }
    return `${type}:${target.trackId ?? ''}`;
};

/**
 * true, если такое событие уже уходило в окне. Иначе помечает отправку.
 * Память вкладки — только запас, когда localStorage закрыт.
 * @param key Ключ
 * @returns Повтор или нет
 */
const claimSend = (key: string): boolean => {
    const now = Date.now();
    let stored: Record<string, number> = {};
    let storageOk = true;
    try {
        const raw = localStorage.getItem(DEDUPE_KEY);
        const parsed = raw ? JSON.parse(raw) as Record<string, number> : {};
        stored = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        storageOk = false;
        stored = memoryDedupe;
    }
    const fresh: Record<string, number> = {};
    for (const [storedKey, at] of Object.entries(stored)) {
        if (typeof at === 'number' && now - at < MUSIC_EVENT_DEDUPE_MS) {
            fresh[storedKey] = at;
        }
    }
    if (fresh[key] != null) {
        return true;
    }
    fresh[key] = now;
    if (storageOk) {
        writeStorage(localStorage, DEDUPE_KEY, JSON.stringify(fresh));
    } else {
        memoryDedupe = fresh;
    }
    return false;
};

/**
 * reachGoal, если тег Метрики уже загрузился. Ошибка тега плеер не роняет.
 * @param goal Идентификатор цели, он же тип события
 * @param params trackId и source — те же, что ушли на сервер
 */
const reachGoal = (goal: MusicEventType, params: { trackId: string; source: string }): void => {
    const ym = (window as Window & MetrikaWindow).ym;
    if (typeof ym !== 'function') {
        return;
    }
    try {
        ym(YANDEX_METRIKA_COUNTER_ID, 'reachGoal', goal, params);
    } catch {
        // Счётчик не должен останавливать воспроизведение.
    }
};

/**
 * Пишет событие на сервер. На уходе со страницы — sendBeacon, иначе fetch с JWT.
 * @param body Тело
 * @param beacon true на pagehide
 */
const postEvent = (body: Record<string, unknown>, beacon: boolean): void => {
    const payload = JSON.stringify(body);
    if (beacon && typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        if (navigator.sendBeacon('/api/music/events', blob)) {
            return;
        }
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
        const token = localStorage.getItem('authToken');
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
    } catch {
        // Без токена событие всё равно анонимное.
    }
    void fetch('/api/music/events', {
        method: 'POST',
        headers,
        body: payload,
        keepalive: true,
    }).catch(() => undefined);
};

/**
 * Считает событие своим счётчиком и, рядом, целью Метрики.
 * Повтор в окне не шлётся ни туда, ни туда.
 * @param type play_start, play_complete или share
 * @param target Запись и контекст подборки
 * @param options beacon — для pagehide, когда fetch могут оборвать
 */
export const recordMusicEvent = (
    type: MusicEventType,
    target: ListenTarget,
    options?: { beacon?: boolean },
): void => {
    if (claimSend(dedupeKey(type, target))) {
        return;
    }
    const source = readListenSource();
    const trackId = target.trackId ?? null;
    reachGoal(type, { trackId: trackId ?? '', source: source ?? '' });
    postEvent({
        type,
        sessionId: getMusicSessionId(),
        trackId,
        albumId: target.albumId ?? null,
        playlistId: target.playlistId ?? null,
        source,
    }, options?.beacon === true);
};
