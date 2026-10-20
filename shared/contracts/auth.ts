import { z } from 'zod';

export const UserIdentitySchema = z.object({
    provider: z.enum(['telegram', 'web', 'email', 'phone']),
    providerUserId: z.string(),
    email: z.string().optional(),
    phone: z.string().optional(),
    verifiedAt: z.coerce.date().optional(),
});

export const UserSchema = z.object({
    _id: z.string().optional(),
    telegram_id: z.number().optional().nullable(),
    first_name: z.string(),
    last_name: z.string().nullable().optional(),
    username: z.string().nullable().optional(),
    photo_url: z.string().nullable().optional(),
    role: z.enum(['super_admin', 'admin', 'user', 'guest']),
    identities: z.array(UserIdentitySchema).optional(),
    emailLogin: z.string().nullable().optional(),
    isRegistered: z.boolean().optional(),
}).passthrough();

/** Запрос привязки или входа по почте (passwordHash в ответах не бывает). */
export const EmailCredentialsRequestSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    /** Обязателен при смене, если пароль уже задан. */
    currentPassword: z.string().min(8).optional(),
});

/** Подтверждение почты по токену из письма. */
export const EmailConfirmRequestSchema = z.object({
    token: z.string().min(1),
});

/** Запрос письма со сбросом пароля. */
export const EmailForgotRequestSchema = z.object({
    email: z.string().email(),
});

/** Ответ forgot — без раскрытия, есть ли аккаунт. */
export const EmailForgotResponseSchema = z.object({
    valid: z.boolean(),
    message: z.string().optional(),
});

/** Установка нового пароля по токену из письма. */
export const EmailResetRequestSchema = z.object({
    token: z.string().min(1),
    password: z.string().min(8),
});

/** Ответ link: либо pendingConfirmation, либо обычная сессия. */
export const EmailLinkResponseSchema = z.object({
    valid: z.boolean(),
    pendingConfirmation: z.boolean().optional(),
    message: z.string().optional(),
    token: z.string().nullable().optional(),
    authProvider: z.enum(['telegram', 'web', 'email', 'phone']).nullable().optional(),
    user: UserSchema.optional(),
});

export const AuthSessionResponseSchema = z.object({
    valid: z.boolean(),
    token: z.string().nullable().optional(),
    authProvider: z.enum(['telegram', 'web', 'email', 'phone']).nullable().optional(),
    user: UserSchema.optional(),
});

export const InviteValidateResponseSchema = z.object({
    valid: z.boolean(),
    purpose: z.string().optional(),
    allowedProviders: z.array(z.enum(['telegram', 'web', 'email', 'phone'])).optional(),
});

export const InviteUseRequestSchema = z.object({
    code: z.string(),
    provider: z.enum(['telegram', 'web', 'email', 'phone']).default('telegram'),
    telegram: z
        .object({
            initData: z.unknown().optional(),
            user: z.string(),
        })
        .optional(),
    web: z
        .object({
            firstName: z.string().optional(),
            first_name: z.string().optional(),
            lastName: z.string().optional(),
            last_name: z.string().optional(),
            email: z.string().optional(),
        })
        .optional(),
});

export const InviteGenerateResponseSchema = z.object({
    code: z.string(),
    inviteLink: z.string(),
    webInviteLink: z.string(),
    telegramInviteLink: z.string(),
    purpose: z.string().optional(),
    initialRole: z.string().optional(),
    allowedProviders: z.array(z.string()).optional(),
    multiUse: z.boolean().optional(),
    expiresAt: z.coerce.date(),
});
