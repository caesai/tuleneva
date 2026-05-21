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
    },
    {
        timestamps: true,
    },
);

userSchema.index({ 'identities.provider': 1, 'identities.providerUserId': 1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
