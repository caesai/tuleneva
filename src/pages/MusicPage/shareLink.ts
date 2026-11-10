/**
 * @file «Поделиться» страницей музыки: системный лист, буфер, затем Telegram.
 */

export interface SharePayload {
    title: string;
    url: string;
}

export interface ShareLinkDeps {
    /** `navigator.share`, если метод есть. */
    share?: (data: SharePayload) => Promise<void>;
    /** Копирует текст. true — буфер принял строку. */
    copy?: (text: string) => Promise<boolean>;
    /** Открывает запасную ссылку (t.me/share). */
    open?: (url: string) => void;
    /** Приложение открыто внутри Telegram Mini App. */
    inTelegram?: boolean;
}

/** Чем закончилась попытка поделиться. */
export type ShareLinkResult = 'shared' | 'copied' | 'telegram' | 'cancelled' | 'failed';

/**
 * Пользователь закрыл системный лист, это не ошибка.
 * @param error Исключение из `navigator.share`
 * @returns true для AbortError
 */
const isShareAbort = (error: unknown): boolean => (
    error instanceof Error && error.name === 'AbortError'
);

/**
 * Делится заголовком и адресом.
 * Сначала Web Share API. Если его нет или он отказал не из-за отмены —
 * копирует адрес. В Mini App, когда буфер тоже недоступен, открывает t.me/share/url.
 * @param input Заголовок и абсолютный адрес
 * @param deps Зависимости браузера
 * @returns Итог, по которому вызывающий показывает тост или ничего не делает
 */
export const shareLink = async (
    input: SharePayload,
    deps: ShareLinkDeps,
): Promise<ShareLinkResult> => {
    if (deps.share) {
        try {
            await deps.share({ title: input.title, url: input.url });
            return 'shared';
        } catch (error) {
            if (isShareAbort(error)) {
                return 'cancelled';
            }
        }
    }
    if (deps.copy && await deps.copy(input.url)) {
        return 'copied';
    }
    if (deps.inTelegram && deps.open) {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(input.url)}&text=${encodeURIComponent(input.title)}`;
        deps.open(shareUrl);
        return 'telegram';
    }
    return 'failed';
};

/**
 * Кладёт строку в буфер обмена.
 * @param text Адрес страницы
 * @returns true, если копирование прошло
 */
export const copyText = async (text: string): Promise<boolean> => {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // В Mini App буфер часто закрыт — ниже запасной путь.
    }
    try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '0';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        const copied = document.execCommand('copy');
        area.remove();
        return copied;
    } catch {
        return false;
    }
};

/**
 * Открывает адрес. В Mini App предпочитает `openTelegramLink`, чтобы не терять жест.
 * @param url Куда вести
 */
export const openShareTarget = (url: string): void => {
    const webApp = (window as Window & {
        Telegram?: { WebApp?: { openTelegramLink?: (link: string) => void } };
    }).Telegram?.WebApp;
    if (typeof webApp?.openTelegramLink === 'function') {
        webApp.openTelegramLink(url);
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
};
