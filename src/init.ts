import {
    backButton,
    viewport,
    themeParams,
    miniApp,
    initData,
    init as initSDK,
    locationManager,
    isTMA,
    isLaunchParamsRetrieveError,
    retrieveLaunchParams,
} from '@telegram-apps/sdk-react';
import {
    setTelegramEnvironment,
    WEB_FALLBACK_LAUNCH_PARAMS,
} from '@/telegram/env.ts';

/**
 * Инициализирует SDK и опциональные компоненты Telegram.
 * Не бросает исключений: в браузере или при блокировке telegram.org приложение продолжает работать.
 * @returns true, если приложение запущено внутри Telegram Mini App.
 */
export function init(): boolean {
    const inTelegram = (() => {
        try {
            return isTMA();
        } catch {
            return false;
        }
    })();

    setTelegramEnvironment(inTelegram);

    try {
        if (inTelegram) {
            initSDK();
        } else {
            initSDK({ launchParams: WEB_FALLBACK_LAUNCH_PARAMS });
        }
    } catch (error) {
        if (isLaunchParamsRetrieveError(error)) {
            console.warn(
                'Telegram launch params unavailable, using web fallback:',
                error,
            );
            try {
                initSDK({ launchParams: WEB_FALLBACK_LAUNCH_PARAMS });
                setTelegramEnvironment(false);
            } catch (fallbackError) {
                console.warn('Telegram SDK fallback init failed:', fallbackError);
                return false;
            }
        } else {
            console.warn('Telegram SDK init failed:', error);
            return false;
        }
    }

    if (!inTelegram) {
        return false;
    }

    try {
        retrieveLaunchParams();
    } catch (error) {
        if (isLaunchParamsRetrieveError(error)) {
            console.warn('Telegram launch params missing after init:', error);
            setTelegramEnvironment(false);
            return false;
        }
        throw error;
    }

    mountTelegramComponents();
    return true;
}

function mountTelegramComponents(): void {
    try {
        if (backButton.isSupported()) {
            backButton.mount();
        }
        if (miniApp.isSupported()) {
            miniApp.mountSync();
            miniApp.bindCssVars();
        }
        themeParams.mountSync();
        themeParams.bindCssVars();
        if (locationManager.isSupported()) {
            locationManager.mount();
        }
        initData.restore();

        if (viewport.mount.isAvailable()) {
            void viewport
                .mount()
                .catch((e) => {
                    console.warn('Viewport mount failed:', e);
                })
                .then(() => {
                    viewport.bindCssVars();
                    if (viewport.expand.isAvailable()) {
                        viewport.expand();
                    }
                });
        }
    } catch (error) {
        console.warn('Telegram components mount skipped:', error);
    }
}
