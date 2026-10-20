const express = require('express');
const crypto = require('crypto');
const InviteCode = require('../models/InviteCode');
const {
    INVITE_CODE_TTL_SECONDS,
    INVITE_CODE_MULTI_USE_TTL_SECONDS,
} = require('../models/InviteCode');
const { parseTelegramUser } = require('./telegramProvider');
const User = require('../models/User');
const {
    findUserByTelegramId,
    upsertTelegramUser,
    buildTelegramGuestUser,
    migrateLegacyTelegramIdentities,
} = require('./identityService');
const { signAuthToken, buildAuthResponse } = require('./tokenService');
const { isAdminLike } = require('./roleHelpers');
const { findValidInvite, consumeInvite, revokeInvite } = require('./inviteService');
const { parseWebProfile, createWebUser } = require('./webProvider');
const {
    linkEmailCredentials,
    confirmEmailToken,
    authenticateEmailPassword,
    requestPasswordReset,
    resetPasswordWithToken,
    mapDuplicateEmailError,
} = require('./emailProvider');
const { safeNotify } = require('../notifications/telegramNotify');

/**
 * Статус HTTP для ошибок email-провайдера.
 * @param {Error} err
 * @returns {number}
 */
const emailErrorStatus = (err) => {
    if (err?.status) return err.status;
    if (
        err?.message?.includes('Invalid')
        || err?.message?.includes('Password')
        || err?.message?.includes('Current password')
        || err?.message?.includes('confirmation token')
        || err?.message?.includes('reset token')
    ) {
        return 400;
    }
    return 500;
};

/**
 * Регистрирует маршруты /api/auth/*.
 * @param {object} options
 * @param {string} options.jwtSecret
 * @param {string} options.botToken
 * @param {string} options.miniAppUrl
 * @param {string} options.webAppBaseUrl
 * @param {Function} options.authenticateToken
 * @param {Function} options.verifyUserExists
 * @param {Function} options.notifyAdmins
 * @param {Function|null} [options.sendMail]
 * @param {Function} [options.broadcastUpdate] - WebSocket broadcast (например users_update)
 */
const createAuthRouter = ({
    jwtSecret,
    botToken,
    miniAppUrl,
    webAppBaseUrl,
    authenticateToken,
    verifyUserExists,
    notifyAdmins,
    sendMail = null,
    broadcastUpdate = () => {},
}) => {
    const router = express.Router();

    const noCache = (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Pragma', 'no-cache');
    };

    router.get('/session', authenticateToken, verifyUserExists, async (req, res) => {
        noCache(res);
        try {
            const user = req.dbUser;
            const token = signAuthToken(user, jwtSecret);
            const provider = user.identities?.[0]?.provider || (user.telegram_id ? 'telegram' : null);

            res.status(200).json(buildAuthResponse(user, token, provider));
        } catch (err) {
            console.error('Session error:', err);
            res.status(500).json({ valid: false, message: 'Session error' });
        }
    });

    router.post('/providers/telegram/login', async (req, res) => {
        noCache(res);
        const { user: userData } = req.body;

        try {
            const tg = parseTelegramUser(userData, botToken);
            let user = await findUserByTelegramId(tg.user.id);

            if (!user) {
                return res.status(200).json({
                    valid: true,
                    token: null,
                    authProvider: 'telegram',
                    user: buildTelegramGuestUser(tg.user),
                });
            }

            user = await upsertTelegramUser(tg.user);
            const token =
                user.role === 'guest' ? null : signAuthToken(user, jwtSecret);

            res.status(200).json(buildAuthResponse(user, token, 'telegram'));
        } catch (err) {
            console.error('Telegram login error:', err);
            res.status(401).json({ valid: false, message: err.message || 'Auth error' });
        }
    });

    router.post('/providers/telegram/register', async (req, res) => {
        noCache(res);
        const { user: userData } = req.body;

        try {
            const tg = parseTelegramUser(userData, botToken);
            const existing = await findUserByTelegramId(tg.user.id);
            if (existing) {
                return res.status(400).json({ valid: false, message: 'User already registered' });
            }

            const user = await upsertTelegramUser(tg.user, { role: 'guest' });
            const token = signAuthToken(user, jwtSecret);
            res.status(201).json(buildAuthResponse(user, token, 'telegram'));

            broadcastUpdate('users_update', { reason: 'telegram_register' });
            const notifyMessage = `@${user.username || user.first_name} запрашивает доступ к бронированию.`;
            safeNotify(notifyAdmins(notifyMessage));
        } catch (err) {
            console.error('Telegram register error:', err);
            res.status(500).json({ valid: false, message: 'Registration error' });
        }
    });

    router.post('/invite/use', async (req, res) => {
        noCache(res);
        const { code, provider = 'telegram', telegram, web } = req.body;

        if (!code) {
            return res.status(400).json({ valid: false, message: 'Missing invite code' });
        }

        try {
            const inviteCode = await findValidInvite(code);
            if (!inviteCode) {
                return res.status(400).json({ valid: false, message: 'Invalid or expired invite code.' });
            }

            if (
                inviteCode.allowedProviders?.length &&
                !inviteCode.allowedProviders.includes(provider)
            ) {
                return res.status(400).json({ valid: false, message: 'Provider not allowed for this invite.' });
            }

            let user;
            let isNewUser = false;

            if (provider === 'telegram') {
                if (!telegram?.user) {
                    return res.status(400).json({ valid: false, message: 'Missing Telegram data' });
                }

                const tg = parseTelegramUser(telegram.user, botToken);
                user = await findUserByTelegramId(tg.user.id);

                if (!user) {
                    user = await upsertTelegramUser(tg.user, {
                        role: inviteCode.initialRole || 'guest',
                    });
                    isNewUser = true;
                } else if (
                    inviteCode.initialRole === 'user'
                    && user.role === 'guest'
                ) {
                    // Общая ссылка должна сразу давать бронирование, даже если человек уже гость.
                    user.role = 'user';
                    await user.save();
                    isNewUser = true;
                }
            } else if (provider === 'web') {
                // Всегда новый UUID-identity: заявленный email не даёт вход в чужой аккаунт.
                const profile = parseWebProfile(web);
                user = await createWebUser(profile, {
                    role: inviteCode.initialRole || 'guest',
                });
                isNewUser = true;
            } else {
                return res.status(400).json({
                    valid: false,
                    message: `Provider "${provider}" is not implemented yet`,
                });
            }

            const consumed = await consumeInvite(code, user._id);
            if (!consumed) {
                if (isNewUser) {
                    await User.deleteOne({ _id: user._id });
                }
                return res.status(400).json({ valid: false, message: 'Invalid or expired invite code.' });
            }

            const token = signAuthToken(user, jwtSecret);
            res.status(201).json(buildAuthResponse(user, token, provider));

            if (isNewUser) {
                broadcastUpdate('users_update', { reason: 'invite_use' });
                const inviteNotifyMessage = `@${user.username || user.first_name} запрашивает доступ (инвайт).`;
                safeNotify(notifyAdmins(inviteNotifyMessage));
            }
        } catch (err) {
            console.error('Invite use error:', err);
            const status = err.message?.includes('required') ? 400 : 500;
            res.status(status).json({
                valid: false,
                message: err.message || 'Failed to use invite code.',
            });
        }
    });

    router.post('/invite/generate', authenticateToken, verifyUserExists, async (req, res) => {
        if (!isAdminLike(req.dbUser.role)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        try {
            const {
                purpose = 'request_access',
                initialRole = 'guest',
                allowedProviders = ['telegram', 'web'],
                multiUse = false,
            } = req.body || {};

            const reusable = multiUse === true;
            const code = crypto.randomBytes(16).toString('hex');
            const ttlSeconds = reusable
                ? INVITE_CODE_MULTI_USE_TTL_SECONDS
                : INVITE_CODE_TTL_SECONDS;
            const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

            const inviteCode = new InviteCode({
                code,
                createdBy: req.dbUser._id,
                expiresAt,
                purpose,
                initialRole,
                allowedProviders,
                multiUse: reusable,
            });
            await inviteCode.save();

            const telegramInviteLink = `${miniAppUrl}?startapp=${code}`;
            const webInviteLink = `${webAppBaseUrl.replace(/\/$/, '')}/?invite=${code}`;

            res.status(201).json({
                code,
                inviteLink: telegramInviteLink,
                webInviteLink,
                telegramInviteLink,
                purpose,
                initialRole,
                allowedProviders,
                multiUse: reusable,
                expiresAt,
            });
        } catch (err) {
            console.error('Error generating invite code:', err);
            res.status(500).json({ message: 'Failed to generate invite code.' });
        }
    });

    /**
     * @route POST /api/auth/invite/revoke
     * @description Закрывает инвайт: одноразовый и многоразовый перестают приниматься.
     */
    router.post('/invite/revoke', authenticateToken, verifyUserExists, async (req, res) => {
        if (!isAdminLike(req.dbUser.role)) {
            return res.status(403).json({ message: 'Access denied' });
        }

        const { code } = req.body || {};
        if (!code) {
            return res.status(400).json({ message: 'Missing invite code' });
        }

        try {
            const inviteCode = await revokeInvite(code);
            if (!inviteCode) {
                return res.status(404).json({ message: 'Invite not found' });
            }
            res.status(200).json({
                revoked: true,
                code: inviteCode.code,
                revokedAt: inviteCode.revokedAt,
            });
        } catch (err) {
            console.error('Error revoking invite code:', err);
            res.status(500).json({ message: 'Failed to revoke invite code.' });
        }
    });

    router.get('/invite/validate/:code', async (req, res) => {
        try {
            const { code } = req.params;
            const inviteCode = await findValidInvite(code);

            res.status(200).json({
                valid: !!inviteCode,
                purpose: inviteCode?.purpose,
                allowedProviders: inviteCode?.allowedProviders,
            });
        } catch (err) {
            console.error('Error validating invite code:', err);
            res.status(500).json({ message: 'Failed to validate invite code.' });
        }
    });

    /**
     * @route POST /api/auth/providers/email/link
     * @description Запрашивает привязку почты (письмо с подтверждением) или сразу меняет пароль на той же почте.
     */
    router.post(
        '/providers/email/link',
        authenticateToken,
        verifyUserExists,
        async (req, res) => {
            noCache(res);
            const { email, password, currentPassword } = req.body || {};
            try {
                const { user, pendingConfirmation } = await linkEmailCredentials(
                    req.dbUser,
                    email,
                    password,
                    {
                        currentPassword,
                        webAppBaseUrl,
                        sendMail,
                    },
                );
                if (pendingConfirmation) {
                    return res.status(200).json({
                        valid: true,
                        pendingConfirmation: true,
                        message: 'Confirmation email sent',
                        user: buildAuthResponse(user, null, 'email').user,
                    });
                }
                const token =
                    user.role === 'guest' ? null : signAuthToken(user, jwtSecret);
                res.status(200).json({
                    ...buildAuthResponse(user, token, 'email'),
                    pendingConfirmation: false,
                });
            } catch (err) {
                const mapped = mapDuplicateEmailError(err);
                console.error('Email link error:', mapped);
                const status = emailErrorStatus(mapped);
                res.status(status).json({
                    valid: false,
                    message: status === 409
                        ? 'Email already in use'
                        : (status < 500 ? mapped.message : 'Failed to link email'),
                });
            }
        },
    );

    /**
     * @route POST /api/auth/providers/email/confirm
     * @description Подтверждает почту по одноразовому токену из письма.
     */
    router.post('/providers/email/confirm', async (req, res) => {
        noCache(res);
        const { token } = req.body || {};
        try {
            const user = await confirmEmailToken(token);
            const authToken =
                user.role === 'guest' ? null : signAuthToken(user, jwtSecret);
            res.status(200).json(buildAuthResponse(user, authToken, 'email'));
        } catch (err) {
            const mapped = mapDuplicateEmailError(err);
            console.error('Email confirm error:', mapped);
            const status = emailErrorStatus(mapped);
            res.status(status).json({
                valid: false,
                message: status === 409
                    ? 'Email already in use'
                    : (status < 500 ? mapped.message : 'Failed to confirm email'),
            });
        }
    });

    /**
     * @route POST /api/auth/providers/email/login
     * @description Вход по почте и паролю; JWT с тем же _id, что у Telegram-аккаунта.
     */
    router.post('/providers/email/login', async (req, res) => {
        noCache(res);
        const { email, password } = req.body || {};
        try {
            const user = await authenticateEmailPassword(email, password);
            if (!user) {
                return res.status(401).json({
                    valid: false,
                    message: 'Invalid email or password',
                });
            }
            const token =
                user.role === 'guest' ? null : signAuthToken(user, jwtSecret);
            res.status(200).json(buildAuthResponse(user, token, 'email'));
        } catch (err) {
            console.error('Email login error:', err);
            const status = err.status || 500;
            res.status(status).json({
                valid: false,
                message: status < 500 ? err.message : 'Login failed',
            });
        }
    });

    /**
     * @route POST /api/auth/providers/email/forgot
     * @description Запрос сброса пароля. Ответ всегда 200 (без enumeration).
     */
    router.post('/providers/email/forgot', async (req, res) => {
        noCache(res);
        const { email } = req.body || {};
        try {
            await requestPasswordReset(email, {
                webAppBaseUrl,
                sendMail,
            });
            res.status(200).json({
                valid: true,
                message: 'If the email is registered, a reset link was sent',
            });
        } catch (err) {
            console.error('Email forgot error:', err);
            res.status(200).json({
                valid: true,
                message: 'If the email is registered, a reset link was sent',
            });
        }
    });

    /**
     * @route POST /api/auth/providers/email/reset
     * @description Установка нового пароля по токену из письма.
     */
    router.post('/providers/email/reset', async (req, res) => {
        noCache(res);
        const { token, password } = req.body || {};
        try {
            const user = await resetPasswordWithToken(token, password);
            const authToken =
                user.role === 'guest' ? null : signAuthToken(user, jwtSecret);
            res.status(200).json(buildAuthResponse(user, authToken, 'email'));
        } catch (err) {
            console.error('Email reset error:', err);
            const status = emailErrorStatus(err);
            res.status(status).json({
                valid: false,
                message: status < 500 ? err.message : 'Failed to reset password',
            });
        }
    });

    router.post(
        '/migrate/telegram-identities',
        authenticateToken,
        verifyUserExists,
        async (req, res) => {
            if (!isAdminLike(req.dbUser.role)) {
                return res.status(403).json({ message: 'Access denied' });
            }
            try {
                const count = await migrateLegacyTelegramIdentities();
                res.json({ migrated: count });
            } catch (err) {
                console.error('Migration error:', err);
                res.status(500).json({ message: 'Migration failed' });
            }
        },
    );

    return router;
};

module.exports = { createAuthRouter };
