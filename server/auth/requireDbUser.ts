import type { Request, Response } from 'express';
import type { UserDocument } from '../models/User';

/**
 * Сужает `req.dbUser` после `verifyUserExists`: без пользователя отвечает 401.
 * Вызывающий код обязан сразу выйти (`if (!user) return`): ответ уже отправлен.
 * @param req Express request
 * @param res Express response
 * @returns Документ пользователя или null
 */
export const requireDbUser = (req: Request, res: Response): UserDocument | null => {
    if (!req.dbUser) {
        res.status(401).json({ message: 'Unauthorized' });
        return null;
    }
    return req.dbUser;
};
