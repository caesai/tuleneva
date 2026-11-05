import type { FilterQuery } from 'mongoose';
import type { InviteHistoryItem } from '../../shared/contracts/auth';
import InviteCode, { type InviteCodeDoc, type InviteCodeDocument } from '../models/InviteCode';

/**
 * Условие «код ещё действует»: не истёк и не закрыт админом.
 * @param {string} code
 * @returns {FilterQuery<InviteCodeDoc>}
 */
const activeInviteFilter = (code: string): FilterQuery<InviteCodeDoc> => ({
    code,
    expiresAt: { $gt: new Date() },
    revokedAt: { $exists: false },
});

/**
 * Ищет действующий инвайт: одноразовый ещё не использован, многоразовый — пока не закрыт.
 * @param {string} code
 * @returns {Promise<InviteCodeDocument|null>}
 */
const findValidInvite = async (code: string): Promise<InviteCodeDocument | null> => {
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
 * @returns {Promise<InviteCodeDocument|null>} Документ или null, если код уже нельзя применить.
 */
const consumeInvite = async (code: string, usedBy: import('mongoose').Types.ObjectId): Promise<InviteCodeDocument | null> => {
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
 * @returns {Promise<InviteCodeDocument|null>}
 */
const revokeInvite = async (code: string): Promise<InviteCodeDocument | null> => {
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

/**
 * Сериализует документ инвайта для API.
 * @param {InviteCodeDoc} doc - Lean-документ InviteCode
 * @returns {InviteHistoryItem}
 */
const serializeInvite = (doc: InviteCodeDoc): InviteHistoryItem => ({
    code: doc.code,
    purpose: doc.purpose,
    initialRole: doc.initialRole,
    allowedProviders: doc.allowedProviders,
    multiUse: Boolean(doc.multiUse),
    useCount: doc.useCount || 0,
    createdBy: doc.createdBy ? String(doc.createdBy) : null,
    usedBy: doc.usedBy ? String(doc.usedBy) : null,
    createdAt: doc.createdAt,
    expiresAt: doc.expiresAt,
    usedAt: doc.usedAt || null,
    revokedAt: doc.revokedAt || null,
});

/**
 * Живой инвайт: не истёк, не отозван, одноразовый ещё не использован.
 * @param {InviteCodeDoc} doc
 * @param {Date} now
 * @returns {boolean}
 */
const isLiveInvite = (doc: InviteCodeDoc, now: Date): boolean =>
    doc.expiresAt.getTime() > now.getTime() &&
    !doc.revokedAt &&
    (doc.multiUse === true || !doc.usedAt);

/**
 * Список живых инвайтов и истории (used/revoked, пока TTL не стёр документ).
 * @returns {Promise<{ live: InviteHistoryItem[], history: InviteHistoryItem[] }>}
 */
const listInviteHistory = async (): Promise<{ live: InviteHistoryItem[]; history: InviteHistoryItem[]; }> => {
    const now = new Date();
    const docs = await InviteCode.find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

    const live: ReturnType<typeof serializeInvite>[] = [];
    const history: ReturnType<typeof serializeInvite>[] = [];
    for (const doc of docs) {
        if (isLiveInvite(doc, now)) {
            live.push(serializeInvite(doc));
            continue;
        }
        if (doc.usedAt || doc.revokedAt) {
            history.push(serializeInvite(doc));
        }
    }
    return { live, history };
};

export {
    findValidInvite,
    consumeInvite,
    revokeInvite,
    listInviteHistory,
    isLiveInvite,
    serializeInvite,
};
