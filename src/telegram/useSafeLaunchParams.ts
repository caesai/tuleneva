import { useMemo } from 'react';
import {
    isLaunchParamsRetrieveError,
    retrieveLaunchParams,
    retrieveRawInitData,
    type LaunchParams,
} from '@telegram-apps/sdk-react';
import { WEB_FALLBACK_LAUNCH_PARAMS } from '@/telegram/env.ts';

export type SafeLaunchParams = {
    launchParams: LaunchParams;
    isTelegram: boolean;
};

export function getSafeLaunchParams(): SafeLaunchParams {
    try {
        return { launchParams: retrieveLaunchParams(), isTelegram: true };
    } catch (error) {
        if (isLaunchParamsRetrieveError(error)) {
            return { launchParams: WEB_FALLBACK_LAUNCH_PARAMS, isTelegram: false };
        }
        throw error;
    }
}

export function useSafeLaunchParams(): SafeLaunchParams {
    return useMemo(getSafeLaunchParams, []);
}

/**
 * Код инвайта из Telegram startapp (`t.me/bot?startapp=...`).
 * SDK кладёт его в launch params; клиент Telegram — ещё и в hash `tgWebAppStartParam`.
 * @param launchParams - Параметры запуска Mini App
 * @returns Код или null, если ссылка без startapp
 */
export function readTelegramStartParam(launchParams: object): string | null {
    const params = launchParams as {
        tgWebAppStartParam?: string;
        startParam?: string;
    };
    const fromSdk = params.tgWebAppStartParam || params.startParam;
    if (fromSdk) return fromSdk;

    if (typeof window === 'undefined') return null;
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return search.get('tgWebAppStartParam') || hash.get('tgWebAppStartParam') || null;
}

export function useSafeRawInitData(): string | undefined {
    return useMemo(() => {
        try {
            const data = retrieveRawInitData();
            return data || undefined;
        } catch (error) {
            if (isLaunchParamsRetrieveError(error)) {
                return undefined;
            }
            throw error;
        }
    }, []);
}
