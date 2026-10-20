/**
 * Cloudflare Worker: прокси исходящих вызовов Bot API.
 *
 * VPS в РФ часто не достучится до api.telegram.org (таймаут).
 * Worker принимает только путь с секретным префиксом и пересылает на Telegram.
 * Long polling (getUpdates) через Worker не используйте — держит запрос слишком долго.
 *
 * Настройка:
 * 1. Cloudflare Dashboard → Workers → Create → вставить этот скрипт.
 * 2. Придумать длинный PREFIX (например openssl rand -hex 24).
 * 3. В api.env на VPS:
 *    TELEGRAM_API_ROOT=https://<имя-worker>.workers.dev/<PREFIX>
 *    (Telegraf ходит на ${TELEGRAM_API_ROOT}/bot<token>/...)
 *
 * Не логируйте тело запросов и токен.
 */

const PREFIX = 'CHANGE_ME_TO_LONG_RANDOM_SECRET';

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
            // duplex нужен для streaming body в Cloudflare Workers
            init.duplex = 'half';
        }

        return fetch(target, init);
    },
};
