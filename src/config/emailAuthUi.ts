/**
 * @file Почтовый UI выключен, пока его явно не включат.
 * Вход пользователей — Telegram Mini App и инвайт.
 */

/**
 * Формы входа по почте и привязки почты.
 * По умолчанию скрыты и в `npm run dev`, и в прод-сборке.
 * Включить локально: `VITE_EMAIL_AUTH_UI=true npm run dev`.
 */
export const EMAIL_AUTH_UI_ENABLED = import.meta.env.VITE_EMAIL_AUTH_UI === 'true';
