/**
 * @file Один повторный заход, если браузер не смог скачать JS-чанк.
 * Так бывает после деплоя: Telegram/iOS держит старый index.html,
 * а хеши в /assets/ уже удалены. Второй автоперезаход запрещён,
 * чтобы сломанный чанк не крутил страницу бесконечно.
 */

/** Ключ sessionStorage. Тот же литерал встроен в index.template.html. */
export const CHUNK_RELOAD_KEY = 'tuleneva:chunk-reload';

/** Уже запросили reload в этом документе (StrictMode вызывает обработчик дважды). */
let reloadStarted = false;

const defaultReload = (): void => {
    window.location.reload();
};

/** Подмена в тестах: у jsdom нельзя шпионить `location.reload`. */
let reloadDocument = defaultReload;

/**
 * @internal Только для unit-тестов.
 * @param reloader - Функция вместо `location.reload`
 */
export const setChunkReloader = (reloader: () => void): void => {
    reloadDocument = reloader;
};

/**
 * @internal Только для unit-тестов.
 */
export const resetChunkReloadForTests = (): void => {
    reloadStarted = false;
    reloadDocument = defaultReload;
};

/**
 * Похоже ли исключение на провал динамического import() / preload.
 * @param error - Причина из lazy(), error boundary или unhandledrejection
 * @returns true для ChunkLoadError и сообщений Safari/Chrome/Firefox про модуль
 */
export const isChunkLoadError = (error: unknown): boolean => {
    const parts: string[] = [];
    const visit = (value: unknown, depth: number) => {
        if (value == null || depth > 3) {
            return;
        }
        if (typeof value === 'string') {
            parts.push(value);
            return;
        }
        if (typeof value !== 'object') {
            return;
        }
        const record = value as { name?: unknown; message?: unknown; cause?: unknown };
        if (typeof record.name === 'string') {
            parts.push(record.name);
        }
        if (typeof record.message === 'string') {
            parts.push(record.message);
        }
        visit(record.cause, depth + 1);
    };
    visit(error, 0);
    return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk|Unable to preload CSS|text\/html/i
        .test(parts.join('\n'));
};

/**
 * Перезагружает страницу один раз на сессию webview.
 * @returns true, если reload уже идёт (в том числе повторный вызов в том же документе)
 */
export const reloadOnceForChunkError = (): boolean => {
    if (reloadStarted) {
        return true;
    }
    try {
        if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') {
            return false;
        }
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    } catch {
        return false;
    }
    reloadStarted = true;
    reloadDocument();
    return true;
};

/**
 * Сбрасывает предохранитель после удачной отрисовки маршрута,
 * чтобы следующий деплой снова мог обновиться сам один раз.
 */
export const clearChunkReloadGuard = (): void => {
    try {
        sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
        // sessionStorage в webview иногда закрыт — страница уже на экране.
    }
};

/**
 * Слушает провалы import(), которые обошли lazy().
 * Ставится до рендера: если упадёт сам входной модуль, сработает скрипт в index.html.
 */
export const installChunkReloadListener = (): void => {
    window.addEventListener('unhandledrejection', (event) => {
        if (!isChunkLoadError(event.reason)) {
            return;
        }
        event.preventDefault();
        reloadOnceForChunkError();
    });
};
