/**
 * @file In-memory лимиты по IP. Ответ 429 — JSON `{ message }`.
 */

/** Параметры in-memory rate limit. Пропущенные поля берутся из дефолтов. */
interface RateLimitOptions {
    /** Окно в миллисекундах. */
    windowMs?: number;
    /** Максимум запросов в окне. */
    max?: number;
    /** Текст ответа 429. */
    message?: string;
}

/** Окно всех именованных лимитов: минута, счётчик в памяти одного процесса. */
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Лимиты по IP. Ключ — `req.ip`: за Nginx это адрес клиента только если
 * приложение доверяет прокси (`trust proxy`, см. `resolveTrustProxy`).
 * Сброс пароля строже остальных auth-маршрутов, чтобы не слать письма пачкой.
 */
const RATE_LIMIT_PRESETS = {
    emailLogin: { max: 10, message: 'Too many login attempts' },
    emailLink: { max: 10, message: 'Too many email link attempts' },
    emailConfirm: { max: 10, message: 'Too many confirmation attempts' },
    emailForgot: { max: 5, message: 'Too many password reset requests' },
    emailReset: { max: 5, message: 'Too many password reset attempts' },
    telegramRegister: { max: 10, message: 'Too many registration attempts' },
    telegramLogin: { max: 40, message: 'Too many login attempts' },
    inviteUse: { max: 40, message: 'Too many invite attempts' },
    book: { max: 30, message: 'Too many booking requests' },
    cancel: { max: 30, message: 'Too many cancellation requests' },
    musicEvents: { max: 60, message: 'Слишком много событий. Подождите немного.' },
} as const;

/** Имя пресета из {@link RATE_LIMIT_PRESETS}. */
type RateLimitPresetName = keyof typeof RATE_LIMIT_PRESETS;

/**
 * Простой in-memory rate limit по IP (без внешних зависимостей).
 * Адрес берётся из `req.ip`. Express подставляет туда клиента из
 * `X-Forwarded-For` только при включённом `trust proxy`.
 * @param {RateLimitOptions} [options]
 * @returns {import('express').RequestHandler & { reset: () => void }}
 */
const createRateLimiter = ({
    windowMs = 60_000,
    max = 30,
    message = 'Too many requests',
}: RateLimitOptions = {}): import('express').RequestHandler & { reset: () => void; } => {
    const hits = new Map<string, { count: number; resetAt: number; }>();

    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     */
    const middleware = (req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
        const ip =
            req.ip
            || req.socket?.remoteAddress
            || req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
            || 'unknown';
        const now = Date.now();
        let entry = hits.get(ip);
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs };
            hits.set(ip, entry);
        }
        entry.count += 1;
        res.setHeader('X-RateLimit-Limit', String(max));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - entry.count)));
        if (entry.count > max) {
            return res.status(429).json({ message });
        }
        return next();
    };

    /**
     * Сбрасывает счётчики (для тестов).
     * @returns {void}
     */
    middleware.reset = (): void => {
        hits.clear();
    };

    return middleware;
};

/**
 * Лимит из {@link RATE_LIMIT_PRESETS}. Каждый вызов — свой счётчик.
 * @param name Имя пресета
 * @returns Middleware и `reset` для тестов
 */
const createPresetRateLimiter = (name: RateLimitPresetName) => {
    const preset = RATE_LIMIT_PRESETS[name];
    return createRateLimiter({
        windowMs: RATE_LIMIT_WINDOW_MS,
        max: preset.max,
        message: preset.message,
    });
};

export {
    createRateLimiter,
    createPresetRateLimiter,
    RATE_LIMIT_PRESETS,
    RATE_LIMIT_WINDOW_MS,
};
export type { RateLimitPresetName };
