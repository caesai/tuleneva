const mongoose = require('mongoose');

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

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
