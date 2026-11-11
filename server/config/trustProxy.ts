/**
 * @file Сколько прокси доверять при разборе `X-Forwarded-For`.
 * На VPS перед API один Nginx на той же машине. Пустой `TRUST_PROXY`
 * значит `loopback`: заголовок учитывается только если соединение пришло
 * с 127.0.0.1 или ::1. Строка `"1"` — это число хопов, не адрес.
 */

/** Значение для `app.set('trust proxy', ...)`. */
type TrustProxySetting = boolean | number | string;

/**
 * Разбирает `TRUST_PROXY`.
 * Пусто — `loopback`. `true` / `false` — как есть. Целое без знака — число хопов.
 * Остальное (имя `loopback`, IP, CIDR, список через запятую) уходит в Express строкой.
 * @param raw Значение переменной. По умолчанию текущий `process.env.TRUST_PROXY`
 * @returns Аргумент `trust proxy`
 */
const resolveTrustProxy = (
    raw: string | undefined = process.env.TRUST_PROXY,
): TrustProxySetting => {
    if (raw == null || raw.trim() === '') {
        return 'loopback';
    }
    const value = raw.trim();
    const lower = value.toLowerCase();
    if (lower === 'true') {
        return true;
    }
    if (lower === 'false') {
        return false;
    }
    if (/^\d+$/.test(value)) {
        return Number(value);
    }
    return value;
};

export {
    resolveTrustProxy,
};
export type { TrustProxySetting };
