/**
 * @file Куда Vite проксирует /api и /ws.
 * По умолчанию это локальный API, не боевой сервер.
 */

/**
 * Цель HTTP и WebSocket прокси.
 * `VITE_API_PROXY_TARGET` — явный адрес (например локальный стенд).
 * `VITE_API_PROXY_INSECURE=true` отключает проверку TLS только если это нужно для своего сертификата.
 * @returns Адреса и флаг проверки сертификата
 */
export const readApiProxy = (): { http: string; ws: string; secure: boolean } => {
    const http = process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:3000';
    const ws = http.replace(/^http/i, 'ws');
    return {
        http,
        ws,
        secure: process.env.VITE_API_PROXY_INSECURE !== 'true',
    };
};
