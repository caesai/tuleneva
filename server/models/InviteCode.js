const mongoose = require('mongoose');

const INVITE_CODE_TTL_SECONDS = 24 * 60 * 60;

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
}, { timestamps: true });

module.exports = mongoose.model('InviteCode', inviteCodeSchema);
module.exports.INVITE_CODE_TTL_SECONDS = INVITE_CODE_TTL_SECONDS;
