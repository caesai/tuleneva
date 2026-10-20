const InviteCode = require('../models/InviteCode');

/**
 * Условие «код ещё действует»: не истёк и не закрыт админом.
 * @param {string} code
 * @returns {object}
 */
const activeInviteFilter = (code) => ({
    code,
    expiresAt: { $gt: new Date() },
    revokedAt: { $exists: false },
});

/**
 * Ищет действующий инвайт: одноразовый ещё не использован, многоразовый — пока не закрыт.
 * @param {string} code
 * @returns {Promise<import('mongoose').Document|null>}
 */
const findValidInvite = async (code) => {
    return InviteCode.findOne({
        ...activeInviteFilter(code),
        $or: [
            { multiUse: true },
            { usedAt: { $exists: false } },
        ],
    });
};

/**
 * Списывает одноразовый инвайт или отмечает ещё одно применение многоразового.
 * @param {string} code
 * @param {import('mongoose').Types.ObjectId} usedBy
 * @returns {Promise<import('mongoose').Document|null>} Документ или null, если код уже нельзя применить.
 */
const consumeInvite = async (code, usedBy) => {
    const now = new Date();
    const once = await InviteCode.findOneAndUpdate(
        {
            ...activeInviteFilter(code),
            multiUse: { $ne: true },
            usedAt: { $exists: false },
        },
        {
            $set: {
                usedAt: now,
                usedBy,
            },
        },
        { new: true },
    );
    if (once) {
        return once;
    }

    return InviteCode.findOneAndUpdate(
        {
            ...activeInviteFilter(code),
            multiUse: true,
        },
        { $inc: { useCount: 1 } },
        { new: true },
    );
};

/**
 * Закрывает инвайт: новые применения перестают проходить сразу.
 * Повторный вызов для уже закрытого кода возвращает тот же документ.
 * @param {string} code
 * @returns {Promise<import('mongoose').Document|null>}
 */
const revokeInvite = async (code) => {
    const existing = await InviteCode.findOne({ code });
    if (!existing) {
        return null;
    }
    if (existing.revokedAt) {
        return existing;
    }
    return InviteCode.findOneAndUpdate(
        { code },
        { $set: { revokedAt: new Date() } },
        { new: true },
    );
};

module.exports = {
    findValidInvite,
    consumeInvite,
    revokeInvite,
};
