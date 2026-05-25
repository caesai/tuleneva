const { isAdminLike } = require('./roleHelpers');

/**
 * Middleware: доступ только для admin / super_admin (после verifyUserExists).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const requireAdmin = (req, res, next) => {
    if (!req.dbUser || !isAdminLike(req.dbUser.role)) {
        return res.status(403).json({ message: 'Access denied' });
    }
    next();
};

module.exports = { requireAdmin };
