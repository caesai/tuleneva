const mongoose = require('mongoose');

const INVITE_CODE_TTL_SECONDS = 24 * 60 * 60;
/** Срок многоразовой ссылки для общего чата, пока её не закроют вручную. */
const INVITE_CODE_MULTI_USE_TTL_SECONDS = 7 * 24 * 60 * 60;

const inviteCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    expiresAt: {
        type: Date,
        required: true,
        index: { expires: 0 },
    },
    purpose: {
        type: String,
        enum: ['request_access', 'direct_join', 'link_identity'],
        default: 'request_access',
    },
    initialRole: {
        type: String,
        enum: ['guest', 'user'],
        default: 'guest',
    },
    allowedProviders: {
        type: [String],
        default: ['telegram'],
    },
    usedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    usedAt: {
        type: Date,
    },
    /** Несколько человек могут пройти по одной ссылке, пока её не закроют. */
    multiUse: {
        type: Boolean,
        default: false,
    },
    /** Сколько раз многоразовый код успешно применили. */
    useCount: {
        type: Number,
        default: 0,
    },
    revokedAt: {
        type: Date,
    },
}, { timestamps: true });

const InviteCode = mongoose.models.InviteCode
    || mongoose.model('InviteCode', inviteCodeSchema);

module.exports = InviteCode;
module.exports.INVITE_CODE_TTL_SECONDS = INVITE_CODE_TTL_SECONDS;
module.exports.INVITE_CODE_MULTI_USE_TTL_SECONDS = INVITE_CODE_MULTI_USE_TTL_SECONDS;
