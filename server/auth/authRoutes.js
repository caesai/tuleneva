const express = require('express');
const crypto = require('crypto');
const InviteCode = require('../models/InviteCode');
const { INVITE_CODE_TTL_SECONDS } = require('../models/InviteCode');
const { parseTelegramUser } = require('./telegramProvider');
const {
    findUserByTelegramId,
    upsertTelegramUser,
    buildTelegramGuestUser,
    migrateLegacyTelegramIdentities,
} = require('./identityService');
const { signAuthToken, buildAuthResponse } = require('./tokenService');
const { isAdminLike } = require('./roleHelpers');
const { findValidInvite, consumeInvite } = require('./inviteService');
const { parseWebProfile, upsertWebUser } = require('./webProvider');

/**
 * Регистрирует маршруты /api/auth/*.
 */
const createAuthRouter = ({
    jwtSecret,
    botToken,
    miniAppUrl,
    webAppBaseUrl,
    authenticateToken,
    verifyUserExists,
    notifyAdmins,
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
            const notifyMessage = `@${user.username || user.first_name} запрашивает доступ к бронированию.`;
            await notifyAdmins(notifyMessage);

            const token = signAuthToken(user, jwtSecret);
            res.status(201).json(buildAuthResponse(user, token, 'telegram'));
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
                }
            } else if (provider === 'web') {
                const profile = parseWebProfile(web);
                user = await upsertWebUser(profile, {
                    role: inviteCode.initialRole || 'guest',
                });
            } else {
                return res.status(400).json({
                    valid: false,
                    message: `Provider "${provider}" is not implemented yet`,
                });
            }

            const consumed = await consumeInvite(code, user._id);
            if (!consumed) {
                return res.status(400).json({ valid: false, message: 'Invalid or expired invite code.' });
            }

            const inviteNotifyMessage = `@${user.username || user.first_name} запрашивает доступ (инвайт).`;
            await notifyAdmins(inviteNotifyMessage);

            const token = signAuthToken(user, jwtSecret);
            res.status(201).json(buildAuthResponse(user, token, provider));
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
            } = req.body || {};

            const code = crypto.randomBytes(16).toString('hex');
            const expiresAt = new Date(Date.now() + INVITE_CODE_TTL_SECONDS * 1000);

            const inviteCode = new InviteCode({
                code,
                createdBy: req.dbUser._id,
                expiresAt,
                purpose,
                initialRole,
                allowedProviders,
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
                expiresAt,
            });
        } catch (err) {
            console.error('Error generating invite code:', err);
            res.status(500).json({ message: 'Failed to generate invite code.' });
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

    router.post('/migrate/telegram-identities', async (req, res) => {
        try {
            const count = await migrateLegacyTelegramIdentities();
            res.json({ migrated: count });
        } catch (err) {
            console.error('Migration error:', err);
            res.status(500).json({ message: 'Migration failed' });
        }
    });

    return router;
};

module.exports = { createAuthRouter };
