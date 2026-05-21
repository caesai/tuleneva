import type { LaunchParams } from '@telegram-apps/sdk-react';

/** Минимальные launch params для работы SDK вне Telegram (браузер, без VPN). */
export const WEB_FALLBACK_LAUNCH_PARAMS: LaunchParams = {
    tgWebAppPlatform: 'web',
    tgWebAppVersion: '8.0',
    tgWebAppThemeParams: {},
};

let isTelegramEnvironment = false;

export function setTelegramEnvironment(value: boolean): void {
    isTelegramEnvironment = value;
}

export function getTelegramEnvironment(): boolean {
    return isTelegramEnvironment;
}
