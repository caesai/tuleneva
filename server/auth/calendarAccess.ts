/**
 * @file Доступ к календарю: JWT сессии или проверенный Telegram init data,
 * и только если документ уже есть в users.
 */
import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import type { UserDocument } from '../models/User';
import { findUserByTelegramId } from './identityService';
import { parseTelegramUser } from './telegramProvider';

/** Заголовок с сырым init data Mini App. В URL его не кладём. */
export const TELEGRAM_INIT_HEADER = 'x-telegram-init-data';

interface CredentialInput {
    jwtSecret: string;
    botToken: string;
    token?: string;
    initData?: string;
}

type ListedUserResult =
    | { ok: true; user: UserDocument }
    | { ok: false; status: 401 | 403 };

/**
 * Ищет пользователя по JWT или по подписи Telegram.
 * Валидный Telegram без записи в users — 403. Нет доказуемой личности — 401.
 * @param input Секрет, токен бота и предъявленные учётные данные
 * @returns Документ или код отказа
 */
export const resolveListedUser = async (input: CredentialInput): Promise<ListedUserResult> => {
    const { jwtSecret, botToken, token, initData } = input;

    if (token) {
        try {
            const payload = jwt.verify(token, jwtSecret) as { userId?: string };
            if (payload?.userId) {
                const user = await User.findById(payload.userId);
                if (user) {
                    return { ok: true, user };
                }
            }
        } catch {
            // Просроченный или чужой JWT. Ниже можно опереться на init data.
        }
    }

    if (initData) {
        try {
            const tg = parseTelegramUser(initData, botToken);
            const user = await findUserByTelegramId(tg.user.id);
            if (!user) {
                return { ok: false, status: 403 };
            }
            return { ok: true, user };
        } catch {
            return { ok: false, status: 401 };
        }
    }

    return { ok: false, status: 401 };
};

/**
 * В стелс-режиме закрывает календарь от анонимов и от Telegram, которого нет в users.
 * Выключенный флаг пропускает запрос как раньше.
 * @param options Секреты и флаг
 * @returns Middleware Express
 */
export const createCalendarAccess = (options: {
    jwtSecret: string;
    botToken: string;
    stealth: boolean;
}): RequestHandler => async (req, res, next) => {
    if (!options.stealth) {
        next();
        return;
    }

    const header = req.headers.authorization;
    const bearer = typeof header === 'string' && header.startsWith('Bearer ')
        ? header.slice('Bearer '.length).trim()
        : undefined;
    const initHeader = req.get(TELEGRAM_INIT_HEADER);
    const initData = initHeader && initHeader.trim() ? initHeader.trim() : undefined;

    const resolved = await resolveListedUser({
        jwtSecret: options.jwtSecret,
        botToken: options.botToken,
        token: bearer || undefined,
        initData,
    });

    if (!resolved.ok) {
        res.status(resolved.status).json({
            error: resolved.status === 401 ? 'Unauthorized' : 'Forbidden',
        });
        return;
    }

    req.dbUser = resolved.user;
    req.user = { userId: String(resolved.user._id), role: resolved.user.role };
    next();
};

/**
 * Первое сообщение сокета: пускать в рассылку броней только человека из users.
 * Тело сообщения в лог не пишется.
 * @param raw Текст кадра
 * @param options Секреты
 * @returns true, если клиента можно подписать на события
 */
export const authorizeListedSocket = async (
    raw: string,
    options: { jwtSecret: string; botToken: string },
): Promise<boolean> => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return false;
    }
    if (!parsed || typeof parsed !== 'object') {
        return false;
    }
    const body = parsed as { type?: unknown; token?: unknown; initData?: unknown };
    if (body.type !== 'auth') {
        return false;
    }
    const resolved = await resolveListedUser({
        jwtSecret: options.jwtSecret,
        botToken: options.botToken,
        token: typeof body.token === 'string' ? body.token : undefined,
        initData: typeof body.initData === 'string' ? body.initData : undefined,
    });
    return resolved.ok;
};
