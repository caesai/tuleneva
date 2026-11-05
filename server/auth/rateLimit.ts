/**
 * Простой in-memory rate limit по IP (без внешних зависимостей).
 * @param {object} [options]
 * @param {number} [options.windowMs=60000] - Окно в миллисекундах
 * @param {number} [options.max=30] - Максимум запросов в окне
 * @param {string} [options.message] - Текст ответа 429
 * @returns {import('express').RequestHandler & { reset: () => void }}
 */
const createRateLimiter = ({
    windowMs = 60_000,
    max = 30,
    message = 'Too many requests',
} : any = {}): import('express').RequestHandler & { reset: () => void; } => {
    /** @type {Map<string, { count: number, resetAt: number }>} */
    const hits: Map<string, { count: number; resetAt: number; }> = new Map();

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

export {
    createRateLimiter,
};
