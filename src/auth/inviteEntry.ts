/**
 * @file Чистые правила входа по инвайту.
 * Лендинг (/) и Mini App (/app) намеренно пропускают ссылку по разным условиям.
 */
import type { IUser } from '@/types/user.types.ts';
import type { TAuthProvider } from '@/types/auth.types.ts';

/**
 * Код инвайта из query (?invite= или tgWebAppStartParam).
 * @param searchParams - URLSearchParams страницы
 * @returns Код или null
 */
export const readInviteCodeFromSearchParams = (
    searchParams: URLSearchParams,
): string | null => {
    return searchParams.get('tgWebAppStartParam') || searchParams.get('invite');
};

/**
 * Лендинг: не тратить ссылку, если сессия уже зарегистрирована
 * (в т.ч. одобренный гость с isRegistered). На /app это правило не действует.
 * @param input.isAuthenticated - Есть ли JWT-сессия
 * @param input.user - Текущий пользователь
 * @returns true — очистить query и не открывать модалку
 */
export const shouldSkipLandingInvite = (input: {
    isAuthenticated: boolean;
    user: IUser | null | undefined;
}): boolean => {
    return Boolean(input.isAuthenticated && input.user?.isRegistered);
};

/**
 * Mini App на /app: тихий apply только пока нет участника.
 * Зарегистрированный guest всё ещё может применить startapp (в отличие от лендинга).
 * @param input.isAuthenticated - Есть ли JWT-сессия
 * @param input.user - Текущий пользователь
 * @returns true — не вызывать registerWithInvite
 */
export const shouldSkipTelegramStartInvite = (input: {
    isAuthenticated: boolean;
    user: IUser | null | undefined;
}): boolean => {
    return Boolean(
        input.isAuthenticated && input.user && input.user.role !== 'guest',
    );
};

/**
 * Показывать поля имени на лендинге (веб вне Telegram).
 * @param input.isInTelegram - Открыто ли в Telegram Mini App
 * @param input.allowedProviders - Провайдеры из validate
 * @returns true — форма firstName/lastName
 */
export const showsWebInviteForm = (input: {
    isInTelegram: boolean;
    allowedProviders: TAuthProvider[];
}): boolean => {
    return !input.isInTelegram && input.allowedProviders.includes('web');
};
