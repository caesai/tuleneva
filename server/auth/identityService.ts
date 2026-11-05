/**
 * Поиск и запись identity (Telegram, email) на документе User.
 * ensureIdentity только меняет документ в памяти — сохраняет вызывающий код.
 */
import type { AnyBulkWriteOperation } from 'mongoose';
import User, {
    type IdentityProvider,
    type StudioRole,
    type UserDocument,
    type UserIdentity,
} from '../models/User';

const IDENTITY_INDEX_NAME = 'identities.provider_1_identities.providerUserId_1';
const DUPLICATE_KEY_CODE = 11000;
const TELEGRAM_OPTIONAL_FIELDS = ['last_name', 'username', 'photo_url'] as const;

/** Поля профиля Telegram, которые попадают в User. */
export interface TelegramProfile {
    id: number | string;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
    photo_url?: string | null;
}

/** Роль задаётся только при создании. Повторный вход её не меняет. */
export interface UpsertTelegramOptions {
    role?: StudioRole;
}

/**
 * Два документа претендуют на одну identity, либо уникальный индекс её отклонил.
 */
export class IdentityConflictError extends Error {
    readonly provider: IdentityProvider;
    readonly providerUserId: string;

    /**
     * @param provider Провайдер identity
     * @param providerUserId Id у провайдера
     */
    constructor(provider: IdentityProvider, providerUserId: string) {
        super(`Conflicting ${provider} identity`);
        this.name = 'IdentityConflictError';
        this.provider = provider;
        this.providerUserId = providerUserId;
    }
}

/**
 * Приводит Telegram id к положительному безопасному целому.
 * @param value Сырой id из init data или базы
 * @returns Число или null, если значение не является id
 */
const parseTelegramId = (value: unknown): number | null => {
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value <= 0) return null;
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const numeric = Number(value);
        if (!Number.isSafeInteger(numeric) || numeric <= 0) return null;
        return numeric;
    }
    return null;
};

/**
 * Пустая строка и отсутствие значения хранятся как null.
 * @param value Поле профиля
 * @returns Непустая строка или null
 */
const optionalText = (value: string | null | undefined): string | null => (
    typeof value === 'string' && value.length > 0 ? value : null
);

/**
 * Код и текст ошибки Mongo, включая cause.
 * @param err Пойманная ошибка
 * @returns code и message, если это объект ошибки
 */
const readMongoError = (err: unknown): { code?: number; message: string } => {
    const seen = new Set<unknown>();
    let current: unknown = err;
    while (current && typeof current === 'object' && !seen.has(current)) {
        seen.add(current);
        const record = current as { code?: unknown; message?: unknown; cause?: unknown };
        const message = typeof record.message === 'string' ? record.message : '';
        if (typeof record.code === 'number') {
            return { code: record.code, message };
        }
        current = record.cause;
    }
    return { message: err instanceof Error ? err.message : '' };
};

/**
 * Ошибка уникального индекса MongoDB.
 * @param err Пойманная ошибка
 * @returns true для кода 11000
 */
const isDuplicateKey = (err: unknown): boolean => readMongoError(err).code === DUPLICATE_KEY_CODE;

/**
 * Конфликт построения индекса identity: старые опции или уже существующие дубли.
 * @param err Ошибка User.init / createIndex
 * @returns true, если можно перейти к ручной проверке индекса
 */
const isIdentityIndexInitError = (err: unknown): boolean => {
    const { code, message } = readMongoError(err);
    if (!message.includes('identities.provider')) return false;
    return code === 85 || code === 86 || code === DUPLICATE_KEY_CODE;
};

/**
 * Дубль именно по паре identity, а не по telegram_id.
 * @param err Ошибка save
 * @returns true, если keyPattern или текст указывают на identities
 */
const isIdentityDuplicate = (err: unknown): boolean => {
    if (!isDuplicateKey(err)) return false;
    const pattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern;
    if (pattern && ('identities.provider' in pattern || 'identities.providerUserId' in pattern)) {
        return true;
    }
    return readMongoError(err).message.includes('identities.provider');
};

/**
 * Находит пользователя по identity provider + id.
 * Больше одного документа — конфликт, произвольный документ не возвращается.
 * @param provider Провайдер identity
 * @param providerUserId Id у провайдера
 * @returns Документ или null
 */
const findUserByIdentity = async (
    provider: IdentityProvider,
    providerUserId: string | number,
): Promise<UserDocument | null> => {
    const id = String(providerUserId);
    const matches = await User.find({
        identities: { $elemMatch: { provider, providerUserId: id } },
    }).limit(2);

    if (matches.length > 1) {
        throw new IdentityConflictError(provider, id);
    }
    return matches[0] ?? null;
};

/**
 * Находит пользователя по telegram_id или telegram-identity.
 * Оба ключа на разных документах считаются конфликтом.
 * @param telegramId Telegram user id
 * @returns Документ или null, если id некорректный либо пользователь не найден
 */
const findUserByTelegramId = async (telegramId: unknown): Promise<UserDocument | null> => {
    const id = parseTelegramId(telegramId);
    if (id == null) return null;

    const providerUserId = String(id);
    const matches = await User.find({
        $or: [
            { telegram_id: id },
            {
                identities: {
                    $elemMatch: { provider: 'telegram', providerUserId },
                },
            },
        ],
    }).limit(2);

    if (matches.length > 1) {
        throw new IdentityConflictError('telegram', providerUserId);
    }
    return matches[0] ?? null;
};

/**
 * Добавляет identity, если такой пары ещё нет. Документ не сохраняет.
 * @param user Документ пользователя
 * @param identity Новая или уже существующая identity
 * @returns true, если identity добавлена в массив
 */
const ensureIdentity = (user: UserDocument, identity: UserIdentity): boolean => {
    const providerUserId = String(identity.providerUserId);
    const exists = user.identities?.some(
        (current) => current.provider === identity.provider
            && String(current.providerUserId) === providerUserId,
    );
    if (exists) return false;

    if (!user.identities) user.identities = [];
    user.identities.push({
        ...identity,
        providerUserId,
        verifiedAt: identity.verifiedAt ?? new Date(),
    });
    return true;
};

/**
 * Обновляет профиль. Поля, которых нет в объекте Telegram, не затирает.
 * @param user Существующий документ
 * @param tgUser Профиль из проверенного init data
 */
const applyTelegramProfile = (user: UserDocument, tgUser: TelegramProfile) => {
    user.first_name = tgUser.first_name;
    for (const field of TELEGRAM_OPTIONAL_FIELDS) {
        if (!Object.hasOwn(tgUser, field)) continue;
        user[field] = optionalText(tgUser[field]);
    }
};

/**
 * Проверяет id и непустое имя.
 * @param tgUser Профиль Telegram
 * @returns Числовой telegram id
 */
const requireTelegramProfile = (tgUser: TelegramProfile): number => {
    const telegramId = parseTelegramId(tgUser.id);
    if (telegramId == null) {
        throw new Error('Invalid Telegram user id');
    }
    if (typeof tgUser.first_name !== 'string' || tgUser.first_name.length === 0) {
        throw new Error('Invalid Telegram user payload');
    }
    return telegramId;
};

/**
 * Пишет профиль и telegram identity в уже найденный документ.
 * Роль здесь не меняется.
 * @param user Найденный пользователь
 * @param tgUser Профиль Telegram
 * @param telegramId Проверенный id
 * @returns Сохранённый документ
 */
const persistTelegramUpdate = async (
    user: UserDocument,
    tgUser: TelegramProfile,
    telegramId: number,
): Promise<UserDocument> => {
    user.telegram_id = telegramId;
    applyTelegramProfile(user, tgUser);
    ensureIdentity(user, {
        provider: 'telegram',
        providerUserId: String(telegramId),
        verifiedAt: new Date(),
    });
    try {
        await user.save();
    } catch (err) {
        if (isDuplicateKey(err)) {
            throw new IdentityConflictError('telegram', String(telegramId));
        }
        throw err;
    }
    return user;
};

/**
 * Создаёт или обновляет пользователя из Telegram profile.
 * role применяется только к новому документу.
 * Повторная вставка при гонке читает уже созданного пользователя.
 * @param tgUser Профиль из проверенного init data
 * @param options Роль для первой записи
 * @returns Сохранённый документ
 */
const upsertTelegramUser = async (
    tgUser: TelegramProfile,
    options: UpsertTelegramOptions = {},
): Promise<UserDocument> => {
    const telegramId = requireTelegramProfile(tgUser);
    const existing = await findUserByTelegramId(telegramId);
    if (existing) {
        return persistTelegramUpdate(existing, tgUser, telegramId);
    }

    const created = new User({
        telegram_id: telegramId,
        first_name: tgUser.first_name,
        last_name: optionalText(tgUser.last_name),
        username: optionalText(tgUser.username),
        photo_url: optionalText(tgUser.photo_url),
        role: options.role || 'guest',
        identities: [{
            provider: 'telegram',
            providerUserId: String(telegramId),
            verifiedAt: new Date(),
        }],
    });

    try {
        await created.save();
        return created;
    } catch (err) {
        if (!isDuplicateKey(err)) throw err;
        if (isIdentityDuplicate(err)) {
            throw new IdentityConflictError('telegram', String(telegramId));
        }
        const winner = await findUserByTelegramId(telegramId);
        if (!winner) throw err;
        return persistTelegramUpdate(winner, tgUser, telegramId);
    }
};

/**
 * Пары identity, которые встречаются больше чем у одного пользователя.
 * @returns До пяти пар provider:providerUserId
 */
const findDuplicateIdentityPairs = async (): Promise<string[]> => {
    const rows = await User.aggregate<{
        _id: { provider?: string; providerUserId?: string };
    }>([
        { $unwind: '$identities' },
        {
            $group: {
                _id: {
                    provider: '$identities.provider',
                    providerUserId: '$identities.providerUserId',
                },
                users: { $addToSet: '$_id' },
            },
        },
        { $match: { 'users.1': { $exists: true } } },
        { $limit: 5 },
    ]);

    return rows.map((row) => `${row._id.provider ?? ''}:${row._id.providerUserId ?? ''}`);
};

/**
 * Ставит уникальный индекс identity.
 * Если в базе остался прежний неуникальный индекс и дублей нет — заменяет его.
 * При дублях индекс не снимает.
 * @returns Promise без значения; при дублях или ошибке построения бросает Error
 */
const ensureUniqueIdentityIndex = async (): Promise<void> => {
    try {
        await User.init();
    } catch (err) {
        if (!isIdentityIndexInitError(err)) throw err;
    }

    const indexes = await User.collection.indexes();
    const current = indexes.find((index) => {
        const keys = Object.keys(index.key ?? {});
        return keys.length === 2
            && keys.includes('identities.provider')
            && keys.includes('identities.providerUserId');
    });
    if (current?.unique && current?.sparse) return;

    const duplicates = await findDuplicateIdentityPairs();
    if (duplicates.length > 0) {
        throw new Error(`Duplicate identities: ${duplicates.join(', ')}`);
    }

    if (current?.name) {
        await User.collection.dropIndex(current.name);
    }
    await User.collection.createIndex(
        { 'identities.provider': 1, 'identities.providerUserId': 1 },
        { unique: true, sparse: true, name: current?.name || IDENTITY_INDEX_NAME },
    );
};

/**
 * Добавляет telegram identity пользователям, у которых есть только legacy telegram_id.
 * Запись пакетом. Конфликт уникального индекса не отменяет уже прошедшие обновления:
 * ошибка bulkWrite пробрасывается, чтобы старт сервера её залогировал.
 * @returns Число изменённых документов, если пакет прошёл целиком
 */
const migrateLegacyTelegramIdentities = async (): Promise<number> => {
    const legacyUsers = await User.find({
        telegram_id: { $exists: true, $ne: null },
        $or: [
            { identities: { $exists: false } },
            { identities: null },
            { identities: { $size: 0 } },
        ],
    }).select('_id telegram_id createdAt').lean();

    const ops: AnyBulkWriteOperation[] = [];
    for (const user of legacyUsers) {
        const telegramId = parseTelegramId(user.telegram_id);
        if (telegramId == null) continue;
        ops.push({
            updateOne: {
                filter: { _id: user._id },
                update: {
                    $set: {
                        identities: [{
                            provider: 'telegram',
                            providerUserId: String(telegramId),
                            verifiedAt: user.createdAt ?? new Date(),
                        }],
                        updatedAt: new Date(),
                    },
                },
            },
        });
    }

    if (ops.length === 0) return 0;

    const result = await User.bulkWrite(ops, { ordered: false });
    return result.modifiedCount ?? 0;
};

/**
 * Гостевой объект Telegram без записи в БД.
 * telegram_id всегда число, как в сохранённом документе.
 * @param tgUser Профиль из проверенного init data
 * @returns Публичный гость с isRegistered: false
 */
const buildTelegramGuestUser = (tgUser: TelegramProfile) => {
    const telegramId = requireTelegramProfile(tgUser);
    return {
        telegram_id: telegramId,
        first_name: tgUser.first_name,
        last_name: optionalText(tgUser.last_name),
        username: optionalText(tgUser.username),
        photo_url: optionalText(tgUser.photo_url),
        role: 'guest' as const,
        isRegistered: false as const,
        identities: [{
            provider: 'telegram' as const,
            providerUserId: String(telegramId),
        }],
    };
};

export {
    findUserByIdentity,
    findUserByTelegramId,
    ensureIdentity,
    upsertTelegramUser,
    ensureUniqueIdentityIndex,
    migrateLegacyTelegramIdentities,
    buildTelegramGuestUser,
};
