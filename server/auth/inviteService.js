const InviteCode = require('../models/InviteCode');

/**
 * Finds a valid unused invite code (not expired).
 */
const findValidInvite = async (code) => {
    return InviteCode.findOne({
        code,
        expiresAt: { $gt: new Date() },
        usedAt: { $exists: false },
    });
};

/**
 * Atomically marks invite as used. Returns updated doc or null if already consumed/expired.
 */
const consumeInvite = async (code, usedBy) => {
    return InviteCode.findOneAndUpdate(
        {
            code,
            expiresAt: { $gt: new Date() },
            usedAt: { $exists: false },
        },
        {
            $set: {
                usedAt: new Date(),
                usedBy,
            },
        },
        { new: true },
    );
};

module.exports = {
    findValidInvite,
    consumeInvite,
};
