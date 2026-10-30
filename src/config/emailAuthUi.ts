/**
 * @file Почтовый UI: флаг для всех и отдельное правило для админов.
 * Вход пользователей — Telegram Mini App и инвайт.
 */

/**
 * Формы входа по почте и привязки почты для всех.
 * По умолчанию скрыты и в `npm run dev`, и в прод-сборке.
 * Включить локально: `VITE_EMAIL_AUTH_UI=true npm run dev`.
 */
export const EMAIL_AUTH_UI_ENABLED = import.meta.env.VITE_EMAIL_AUTH_UI === 'true';

/**
 * Показывать ли форму привязки своей почты на расписании.
 * Админ и супер-админ видят её всегда (вход с машины без флага в проде Mini App).
 * Остальные — только при `VITE_EMAIL_AUTH_UI`. Гость форму не видит.
 *
 * @param options.isAuthenticated - Есть JWT-сессия
 * @param options.isGuest - Роль guest
 * @param options.isAdmin - admin или super_admin
 * @param options.emailAuthUiEnabled - Флаг `VITE_EMAIL_AUTH_UI`
 * @returns true, если блок привязки нужно показать
 */
export const shouldShowEmailLinkForm = (options: {
    isAuthenticated: boolean;
    isGuest: boolean;
    isAdmin: boolean;
    emailAuthUiEnabled?: boolean;
}): boolean => {
    const {
        isAuthenticated,
        isGuest,
        isAdmin,
        emailAuthUiEnabled = EMAIL_AUTH_UI_ENABLED,
    } = options;

    if (!isAuthenticated || isGuest) {
        return false;
    }

    if (isAdmin) {
        return true;
    }

    return emailAuthUiEnabled;
};
