import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import User from '../../models/User';
import {
    IdentityConflictError,
    buildTelegramGuestUser,
    ensureIdentity,
    ensureUniqueIdentityIndex,
    findUserByIdentity,
    findUserByTelegramId,
    migrateLegacyTelegramIdentities,
    upsertTelegramUser,
} from '../../auth/identityService';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    seedUser,
} from '../helpers/testApp';

const dropIdentityIndex = async () => {
    const indexes = await User.collection.indexes();
    const identityIndex = indexes.find((index) => {
        const keys = Object.keys(index.key ?? {});
        return keys.includes('identities.provider') && keys.includes('identities.providerUserId');
    });
    if (identityIndex?.name) {
        await User.collection.dropIndex(identityIndex.name);
    }
};

const restoreIdentityIndex = async () => {
    await clearTestDb();
    await ensureUniqueIdentityIndex();
};

describe('identityService', () => {
    beforeAll(async () => {
        await connectTestDb();
        await User.init();
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
    });

    it('findUserByTelegramId ignores values that are not a telegram id', async () => {
        expect(await findUserByTelegramId(0)).toBeNull();
        expect(await findUserByTelegramId('nope')).toBeNull();
        expect(await findUserByTelegramId(null)).toBeNull();
    });

    it('rejects split telegram_id and identity', async () => {
        await seedUser({
            telegram_id: 42,
            first_name: 'ById',
            identities: [{ provider: 'telegram', providerUserId: '999' }],
        });
        await seedUser({
            first_name: 'ByIdentity',
            identities: [{ provider: 'telegram', providerUserId: '42' }],
        });

        await expect(findUserByTelegramId(42)).rejects.toBeInstanceOf(IdentityConflictError);
        await expect(upsertTelegramUser({
            id: 42,
            first_name: 'Merged',
        })).rejects.toBeInstanceOf(IdentityConflictError);

        const byId = await User.findOne({ telegram_id: 42 });
        expect(byId?.identities.map((item) => item.providerUserId)).toEqual(['999']);
        expect(await User.countDocuments()).toBe(2);
    });

    it('creates a guest once when two upserts race', async () => {
        const profile = { id: 4242, first_name: 'Race', last_name: 'User' };
        const [first, second] = await Promise.all([
            upsertTelegramUser(profile, { role: 'guest' }),
            upsertTelegramUser(profile, { role: 'user' }),
        ]);

        expect(String(first._id)).toBe(String(second._id));
        const users = await User.find({ telegram_id: 4242 });
        expect(users).toHaveLength(1);
        expect(users[0]?.identities).toHaveLength(1);
        expect(['guest', 'user']).toContain(users[0]?.role);
    });

    it('does not change role or omitted profile fields', async () => {
        await upsertTelegramUser({
            id: 100,
            first_name: 'Ada',
            last_name: 'Lovelace',
            username: 'ada',
            photo_url: 'https://example.test/ada.jpg',
        }, { role: 'admin' });

        const updated = await upsertTelegramUser({
            id: 100,
            first_name: 'Augusta',
        }, { role: 'guest' });

        expect(updated.role).toBe('admin');
        expect(updated.first_name).toBe('Augusta');
        expect(updated.last_name).toBe('Lovelace');
        expect(updated.username).toBe('ada');
        expect(updated.photo_url).toBe('https://example.test/ada.jpg');

        const cleared = await upsertTelegramUser({
            id: 100,
            first_name: 'Augusta',
            last_name: '',
            username: null,
        });
        expect(cleared.last_name).toBeNull();
        expect(cleared.username).toBeNull();
        expect(cleared.photo_url).toBe('https://example.test/ada.jpg');
    });

    it('builds a guest with a numeric telegram id', () => {
        expect(buildTelegramGuestUser({
            id: '77',
            first_name: 'Guest',
            username: 'guest',
        })).toMatchObject({
            telegram_id: 77,
            first_name: 'Guest',
            username: 'guest',
            last_name: null,
            role: 'guest',
            isRegistered: false,
            identities: [{ provider: 'telegram', providerUserId: '77' }],
        });
        expect(() => buildTelegramGuestUser({ id: 0, first_name: 'Guest' }))
            .toThrow('Invalid Telegram user id');
    });

    it('ensureIdentity is idempotent and does not save', () => {
        const user = new User({ first_name: 'Mail', role: 'guest', identities: [] });
        expect(ensureIdentity(user, {
            provider: 'email',
            providerUserId: 'a@example.com',
            email: 'a@example.com',
        })).toBe(true);
        expect(ensureIdentity(user, {
            provider: 'email',
            providerUserId: 'a@example.com',
        })).toBe(false);
        expect(user.identities).toHaveLength(1);
        expect(user.isNew).toBe(true);
    });

    it('migrates only legacy telegram users', async () => {
        await User.collection.insertOne({
            first_name: 'Legacy',
            role: 'guest',
            telegram_id: 88001,
        });
        await seedUser({
            telegram_id: 88002,
            identities: [{ provider: 'telegram', providerUserId: '88002' }],
        });

        expect(await migrateLegacyTelegramIdentities()).toBe(1);
        const legacy = await User.findOne({ telegram_id: 88001 });
        expect(legacy?.identities).toHaveLength(1);
        expect(legacy?.identities[0]?.providerUserId).toBe('88001');
        expect(legacy?.identities[0]?.verifiedAt).toBeInstanceOf(Date);
        expect(await migrateLegacyTelegramIdentities()).toBe(0);

        const kept = await User.findOne({ telegram_id: 88002 });
        expect(kept?.identities).toHaveLength(1);
    });

    it('keeps migrating other users when one identity is already taken', async () => {
        await seedUser({
            first_name: 'Owner',
            identities: [{ provider: 'telegram', providerUserId: '5' }],
        });
        await seedUser({
            telegram_id: 5,
            first_name: 'LegacyConflict',
            identities: [],
        });
        await seedUser({
            telegram_id: 6,
            first_name: 'LegacyOk',
            identities: [],
        });

        await expect(migrateLegacyTelegramIdentities()).rejects.toThrow(/E11000|duplicate key/i);

        const conflict = await User.findOne({ telegram_id: 5 });
        const migrated = await User.findOne({ telegram_id: 6 });
        expect(conflict?.identities ?? []).toHaveLength(0);
        expect(migrated?.identities[0]?.providerUserId).toBe('6');
    });

    it('replaces a non-unique identity index when there are no duplicates', async () => {
        await dropIdentityIndex();
        await User.collection.createIndex(
            { 'identities.provider': 1, 'identities.providerUserId': 1 },
            { name: 'identities.provider_1_identities.providerUserId_1' },
        );

        await ensureUniqueIdentityIndex();

        const indexes = await User.collection.indexes();
        const identityIndex = indexes.find((index) => index.name === 'identities.provider_1_identities.providerUserId_1');
        expect(identityIndex?.unique).toBe(true);
        expect(identityIndex?.sparse).toBe(true);
    });

    it('does not drop the index while duplicate identities exist', async () => {
        try {
            await dropIdentityIndex();
            await User.create({
                first_name: 'One',
                role: 'guest',
                identities: [{ provider: 'email', providerUserId: 'dup@example.com' }],
            });
            await User.create({
                first_name: 'Two',
                role: 'guest',
                identities: [{ provider: 'email', providerUserId: 'dup@example.com' }],
            });

            await expect(findUserByIdentity('email', 'dup@example.com'))
                .rejects.toBeInstanceOf(IdentityConflictError);
            await expect(ensureUniqueIdentityIndex()).rejects.toThrow(/Duplicate identities/);

            const indexes = await User.collection.indexes();
            const identityIndex = indexes.find((index) => {
                const keys = Object.keys(index.key ?? {});
                return keys.includes('identities.provider');
            });
            expect(identityIndex?.unique).not.toBe(true);
        } finally {
            await restoreIdentityIndex();
        }
    });
});
