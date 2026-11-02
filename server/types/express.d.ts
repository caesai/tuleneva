/**
 * Расширение Express Request полями auth middleware.
 */
declare global {
    namespace Express {
        interface Request {
            /** Пользователь из БД после authenticateToken / optionalAuth. */
            dbUser?: any;
            /** JWT payload после authenticateToken. */
            user?: {
                userId: string;
                role: string;
            };
        }
    }
}

export {};
