/**
 * JWT helpers for auth sessions.
 */

const signAuthToken = (user, jwtSecret) => {
    const jwt = require('jsonwebtoken');
    return jwt.sign(
        { userId: user._id, role: user.role },
        jwtSecret,
        { expiresIn: '1d' },
    );
};

const buildAuthResponse = (user, token, authProvider = null) => {
    const userObj = user.toObject ? user.toObject() : { ...user };
    return {
        valid: true,
        token: token ?? null,
        authProvider,
        user: {
            ...userObj,
            isRegistered: !!token || userObj.isRegistered === true,
        },
    };
};

module.exports = {
    signAuthToken,
    buildAuthResponse,
};
