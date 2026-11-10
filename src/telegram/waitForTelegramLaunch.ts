/**
 * @file Повторное чтение Telegram init data.
 * На первом тике мобильного webview hash с `tgWebAppData` часто ещё пуст,
 * а `useMemo` в {@link useSafeLaunchParams} навсегда запоминает «это не Telegram».
 */
import {
    isLaunchParamsRetrieveError,
    retrieveLaunchParams,
    retrieveRawInitData,
} from '@telegram-apps/sdk-react';
import { buildTelegramAuthPayload } from '@/auth/telegramAuth.ts';
import { getTelegramEnvironment, setTelegramEnvironment } from '@/telegram/env.ts';
import type { ITelegramAuthPayload } from '@/types/auth.types.ts';

/** Пауза перед второй попыткой прочитать init data. */
export const LATE_TELEGRAM_RETRY_MS = 400;

export interface TelegramLaunchRead {
    payload: ITelegramAuthPayload;
    /** true, если окружение Telegram распознали только со второй попытки. */
    discoveredLate: boolean;
}

/**
 * Есть ли смысл ждать hash: телефон, webview или iframe Telegram Web.
 * В обычном десктопном браузере ждём не нужно.
 * @returns true, если init data может появиться на следующем тике
 */
export const shouldWaitForLateTelegram = (): boolean => {
    if (typeof window === 'undefined') {
        return false;
    }
    try {
        if (window.parent !== window) {
            return true;
        }
    } catch {
        return true;
    }
    if ('TelegramWebviewProxy' in window) {
        return true;
    }
    const ua = navigator.userAgent || '';
    if (/Telegram|iPhone|iPad|iPod|Android|Mobile/i.test(ua)) {
        return true;
    }
    return /tgWebApp/i.test(window.location.href);
};

/**
 * Синхронно читает launch params и raw init data.
 * @returns Пара или null, если Mini App ещё не отдала данные
 */
const readSdkLaunch = (): { launchParams: object; rawInitData: string } | null => {
    try {
        const launchParams = retrieveLaunchParams();
        const rawInitData = retrieveRawInitData();
        if (!rawInitData) {
            return null;
        }
        return { launchParams, rawInitData };
    } catch (error) {
        if (isLaunchParamsRetrieveError(error)) {
            return null;
        }
        throw error;
    }
};

const toRead = (
    launchParams: object,
    rawInitData: string,
    discoveredLate: boolean,
): TelegramLaunchRead => {
    if (!getTelegramEnvironment()) {
        setTelegramEnvironment(true);
    }
    return {
        payload: buildTelegramAuthPayload(launchParams, rawInitData),
        discoveredLate,
    };
};

/**
 * Возвращает payload входа через Telegram.
 * Если на первом чтении init data нет, один раз ждёт и читает снова —
 * так холодный запуск Mini App не считается анонимным.
 * @param immediate Уже прочитанные хуком params, если raw init data был сразу
 * @returns Payload или null, если это не Telegram
 */
export const readTelegramLoginPayload = async (
    immediate: { launchParams: object; rawInitData: string } | null,
): Promise<TelegramLaunchRead | null> => {
    if (immediate?.rawInitData) {
        return toRead(immediate.launchParams, immediate.rawInitData, false);
    }

    const first = readSdkLaunch();
    if (first) {
        return toRead(first.launchParams, first.rawInitData, !getTelegramEnvironment());
    }
    if (!shouldWaitForLateTelegram()) {
        return null;
    }

    await new Promise<void>((resolve) => {
        window.setTimeout(resolve, LATE_TELEGRAM_RETRY_MS);
    });

    const second = readSdkLaunch();
    if (!second) {
        return null;
    }
    return toRead(second.launchParams, second.rawInitData, true);
};
