/**
 * @file Доступ только роли super_admin из решётки ролей.
 */
import type { NextFunction, Request, Response } from 'express';
import { isSuperAdmin } from './roleHelpers';
import { requireDbUser } from './requireDbUser';

/**
 * Middleware после verifyUserExists. Обычный admin сюда не проходит.
 * @param req Запрос
 * @param res Ответ
 * @param next Дальше
 */
const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    const dbUser = requireDbUser(req, res);
    if (!dbUser) {
        return;
    }
    if (!isSuperAdmin(dbUser.role)) {
        res.status(403).json({ message: 'Access denied' });
        return;
    }
    next();
};

export {
    requireSuperAdmin,
};
