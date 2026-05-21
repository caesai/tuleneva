import type { ITelegramAuthPayload } from '@/types/auth.types.ts';

/**
 * Формирует payload для Telegram-провайдера из launch params.
 */
export const buildTelegramAuthPayload = (
    launchParams: object,
    rawInitData: string,
): ITelegramAuthPayload => ({
    provider: 'telegram',
    initData: launchParams,
    user: rawInitData,
});
