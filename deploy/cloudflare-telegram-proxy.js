/**
 * Cloudflare Worker: исходящий Bot API + входящий webhook-реле.
 *
 * Исходящее (VPS → Telegram): Telegraf бьёт в
 *   https://<worker>/<PREFIX>/bot<token>/<method>
 *
 * Входящее (Telegram → VPS): webhook на
 *   https://<worker>/<PREFIX>/hook
 * (на РФ-VPS у Telegram часто Connection timed out напрямую).
 *
 * В Cloudflare подставьте свои PREFIX и WEBHOOK_SECRET, затем Deploy.
 * В api.env:
 *   TELEGRAM_API_ROOT=https://<worker>/<PREFIX>/
 *   TELEGRAM_WEBHOOK_SECRET=<тот же WEBHOOK_SECRET>
 *   TELEGRAM_WEBHOOK_URL=https://<worker>/<PREFIX>/hook
 *
 * Не коммитьте реальные секреты в git.
 */

const PREFIX = 'CHANGE_ME_TO_LONG_RANDOM_SECRET';
const ORIGIN_WEBHOOK = 'https://tuleneva25.ru/api/telegram/webhook';
/** Тот же, что TELEGRAM_WEBHOOK_SECRET в /etc/tuleneva/api.env */
const WEBHOOK_SECRET = 'CHANGE_ME_SAME_AS_VPS_TELEGRAM_WEBHOOK_SECRET';

export default {
    /**
     * @param {Request} request
     * @returns {Promise<Response>}
     */
    async fetch(request) {
        const url = new URL(request.url);
        const parts = url.pathname.split('/').filter(Boolean);

        if (parts[0] !== PREFIX) {
            return new Response('Not found', { status: 404 });
        }

        if (parts[1] === 'hook' && parts.length === 2) {
            if (request.method !== 'POST') {
                return new Response('Method not allowed', { status: 405 });
            }
            const init = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Telegram-Bot-Api-Secret-Token': WEBHOOK_SECRET,
                },
                body: request.body,
            };
            init.duplex = 'half';
            return fetch(ORIGIN_WEBHOOK, init);
        }

        const telegramPath = parts.slice(1).join('/');
        if (!telegramPath) {
            return new Response('Bad path', { status: 400 });
        }

        const target = new URL(`https://api.telegram.org/${telegramPath}`);
        target.search = url.search;

        const init = {
            method: request.method,
            headers: new Headers(request.headers),
        };
        init.headers.delete('host');

        if (request.method !== 'GET' && request.method !== 'HEAD') {
            init.body = request.body;
            init.duplex = 'half';
        }

        return fetch(target, init);
    },
};
