const User = require('../models/User');

/**
 * Находит пользователя по identity provider + id.
 */
const findUserByIdentity = async (provider, providerUserId) => {
    return User.findOne({
        identities: {
            $elemMatch: { provider, providerUserId: String(providerUserId) },
        },
    });
};

/**
 * Находит пользователя по telegram_id (legacy + совместимость).
 */
const findUserByTelegramId = async (telegramId) => {
    const id = Number(telegramId);
    let user = await User.findOne({ telegram_id: id });
    if (!user) {
        user = await findUserByIdentity('telegram', String(id));
    }
    return user;
};

/**
 * Добавляет identity, если её ещё нет.
 */
const ensureIdentity = (user, identity) => {
    const exists = user.identities?.some(
        (i) => i.provider === identity.provider && i.providerUserId === identity.providerUserId,
    );
    if (!exists) {
        if (!user.identities) user.identities = [];
        user.identities.push({
            ...identity,
            verifiedAt: identity.verifiedAt || new Date(),
        });
    }
};

/**
 * Создаёт или обновляет пользователя из Telegram profile.
 */
const upsertTelegramUser = async (tgUser, options = {}) => {
    const telegramId = Number(tgUser.id);
    const identity = {
        provider: 'telegram',
        providerUserId: String(telegramId),
        verifiedAt: new Date(),
    };

    let user = await findUserByTelegramId(telegramId);

    if (!user) {
        user = new User({
            telegram_id: telegramId,
            first_name: tgUser.first_name,
            last_name: tgUser.last_name || null,
            username: tgUser.username || null,
            photo_url: tgUser.photo_url || null,
            role: options.role || 'guest',
            identities: [identity],
        });
        await user.save();
        return user;
    }

    user.telegram_id = telegramId;
    user.first_name = tgUser.first_name;
    user.last_name = tgUser.last_name || null;
    user.username = tgUser.username || null;
    user.photo_url = tgUser.photo_url || null;
    if (options.role) user.role = options.role;
    ensureIdentity(user, identity);
    await user.save();
    return user;
};

/**
 * Миграция legacy пользователей: добавляет telegram identity если отсутствует.
 */
const migrateLegacyTelegramIdentities = async () => {
    const users = await User.find({
        telegram_id: { $exists: true, $ne: null },
        $or: [
            { identities: { $exists: false } },
            { identities: { $size: 0 } },
        ],
    });

    for (const user of users) {
        ensureIdentity(user, {
            provider: 'telegram',
            providerUserId: String(user.telegram_id),
            verifiedAt: user.createdAt || new Date(),
        });
        await user.save();
    }

    return users.length;
};

/**
 * Гостевой объект Telegram без записи в БД.
 */
const buildTelegramGuestUser = (tgUser) => ({
    telegram_id: tgUser.id,
    first_name: tgUser.first_name,
    last_name: tgUser.last_name || null,
    username: tgUser.username || null,
    photo_url: tgUser.photo_url || null,
    role: 'guest',
    isRegistered: false,
    identities: [{ provider: 'telegram', providerUserId: String(tgUser.id) }],
});

module.exports = {
    findUserByIdentity,
    findUserByTelegramId,
    ensureIdentity,
    upsertTelegramUser,
    migrateLegacyTelegramIdentities,
    buildTelegramGuestUser,
};
