import type { NextFunction, Request, Response } from 'express';
import { isAdminLike } from './roleHelpers';
import { requireDbUser } from './requireDbUser';

/**
 * Middleware: доступ только для admin / super_admin (после verifyUserExists).
 * Нет пользователя — 401, как у `requireDbUser`. Роль без прав админки — 403.
 * @param req Express request
 * @param res Express response
 * @param next Следующий middleware
 */
const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const dbUser = requireDbUser(req, res);
    if (!dbUser) return;
    if (!isAdminLike(dbUser.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }
    next();
};

export {
    requireAdmin,
};
