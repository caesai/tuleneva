const crypto = require('crypto');
const {
    findUserByIdentity,
    ensureIdentity,
} = require('./identityService');
const User = require('../models/User');

/**
 * Normalizes web invite profile from request body.
 */
const parseWebProfile = (web = {}) => {
    const firstName = String(web.firstName || web.first_name || '').trim();
    const lastName = String(web.lastName || web.last_name || '').trim() || null;
    const email = String(web.email || '').trim().toLowerCase() || null;

    if (!firstName) {
        throw new Error('First name is required');
    }

    return { firstName, lastName, email };
};

/**
 * Resolves stable providerUserId for web identity.
 */
const resolveWebProviderUserId = (email) => {
    if (email) return email;
    return crypto.randomUUID();
};

/**
 * Creates or finds user for web invite registration.
 */
const upsertWebUser = async (profile, options = {}) => {
    const providerUserId = resolveWebProviderUserId(profile.email);
    const identity = {
        provider: 'web',
        providerUserId,
        email: profile.email || undefined,
        verifiedAt: new Date(),
    };

    let user = await findUserByIdentity('web', providerUserId);

    if (!user && profile.email) {
        user = await User.findOne({
            identities: {
                $elemMatch: { provider: 'web', email: profile.email },
            },
        });
    }

    if (!user) {
        user = new User({
            first_name: profile.firstName,
            last_name: profile.lastName,
            username: profile.email || null,
            role: options.role || 'guest',
            identities: [identity],
        });
        await user.save();
        return user;
    }

    user.first_name = profile.firstName;
    user.last_name = profile.lastName;
    if (profile.email) {
        user.username = profile.email;
    }
    if (options.role) user.role = options.role;
    ensureIdentity(user, identity);
    await user.save();
    return user;
};

module.exports = {
    parseWebProfile,
    upsertWebUser,
};
