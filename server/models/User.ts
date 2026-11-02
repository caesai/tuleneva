import mongoose, { type HydratedDocument, type Model } from 'mongoose';
import { ALL_ROLES } from '../../shared/roleLattice';

/** Роль пользователя студии. */
export type StudioRole = (typeof ALL_ROLES)[number];

/** Провайдер идентичности. */
export type IdentityProvider = 'telegram' | 'web' | 'email' | 'phone';

/**
 * Идентичность в документе пользователя (без собственного `_id`).
 */
export interface UserIdentity {
    provider: IdentityProvider;
    providerUserId: string;
    email?: string;
    phone?: string;
    verifiedAt?: Date;
}

/**
 * Поля документа User в MongoDB.
 * Секреты с `select: false` остаются в типе: после `.select('+passwordHash')` они есть.
 */
export interface UserDoc {
    telegram_id?: number | null;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
    photo_url?: string | null;
    role: StudioRole;
    identities: UserIdentity[];
    emailLogin?: string | null;
    passwordHash?: string;
    pendingEmail?: string;
    pendingPasswordHash?: string;
    emailConfirmTokenHash?: string;
    emailConfirmExpires?: Date;
    passwordResetTokenHash?: string;
    passwordResetExpires?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Hydrated-документ User (с методами Mongoose). */
export type UserDocument = HydratedDocument<UserDoc>;

const userIdentitySchema = new mongoose.Schema(
    {
        provider: {
            type: String,
            enum: ['telegram', 'web', 'email', 'phone'],
            required: true,
        },
        providerUserId: {
            type: String,
            required: true,
        },
        email: { type: String },
        phone: { type: String },
        verifiedAt: { type: Date },
    },
    { _id: false },
);

/**
 * Пользователь студии: Telegram и/или почта на одном документе.
 * passwordHash не попадает в обычные find без явного select('+passwordHash').
 */
const userSchema = new mongoose.Schema(
    {
        telegram_id: {
            type: Number,
            sparse: true,
            unique: true,
        },
        first_name: {
            type: String,
            required: true,
        },
        last_name: {
            type: String,
        },
        username: {
            type: String,
        },
        photo_url: {
            type: String,
        },
        role: {
            type: String,
            enum: ['super_admin', 'admin', 'user', 'guest'],
            default: 'guest',
        },
        identities: {
            type: [userIdentitySchema],
            default: [],
        },
        emailLogin: {
            type: String,
            lowercase: true,
            trim: true,
            sparse: true,
            unique: true,
        },
        passwordHash: {
            type: String,
            select: false,
        },
        /** Почта, ожидающая подтверждения по ссылке из письма. */
        pendingEmail: {
            type: String,
            lowercase: true,
            trim: true,
            select: false,
        },
        pendingPasswordHash: {
            type: String,
            select: false,
        },
        emailConfirmTokenHash: {
            type: String,
            select: false,
        },
        emailConfirmExpires: {
            type: Date,
            select: false,
        },
        /** Сброс пароля по письму (отдельно от подтверждения почты). */
        passwordResetTokenHash: {
            type: String,
            select: false,
        },
        passwordResetExpires: {
            type: Date,
            select: false,
        },
    },
    {
        timestamps: true,
    },
);

userSchema.index({ 'identities.provider': 1, 'identities.providerUserId': 1 });

const User =
    (mongoose.models.User as Model<UserDoc> | undefined)
    ?? mongoose.model<UserDoc>('User', userSchema);

export default User;
