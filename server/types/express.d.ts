/**
 * Расширение Express Request полями auth middleware.
 */
import type { UserDocument } from '../models/User';

declare global {
    namespace Express {
        interface Request {
            /** Пользователь из БД после authenticateToken / optionalAuth. */
            dbUser?: UserDocument;
            /** JWT payload после authenticateToken. */
            user?: {
                userId: string;
                role: string;
            };
        }
    }
}

export {};
