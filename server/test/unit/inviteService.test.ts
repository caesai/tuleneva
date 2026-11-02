import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import InviteCode from '../../models/InviteCode';
import {
    findValidInvite,
    consumeInvite,
    revokeInvite,
    listInviteHistory,
} from '../../auth/inviteService';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    seedUser,
} from '../helpers/testApp';

describe('inviteService', () => {
    beforeAll(async () => {
        await connectTestDb();
    });

    afterAll(async () => {
        await disconnectTestDb();
    });

    beforeEach(async () => {
        await clearTestDb();
    });

    it('findValidInvite returns unused non-expired code', async () => {
        const admin = await seedUser({ role: 'admin' });
        await InviteCode.create({
            code: 'valid-code',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() + 3600000),
        });
        const found = await findValidInvite('valid-code');
        expect(found).toBeTruthy();
        if (!found) {
            throw new Error('Invite not found');
        }
        expect(found.code).toBe('valid-code');
    });

    it('findValidInvite returns null for expired code', async () => {
        const admin = await seedUser({ role: 'admin' });
        await InviteCode.create({
            code: 'expired-code',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() - 1000),
        });
        expect(await findValidInvite('expired-code')).toBeNull();
    });

    it('consumeInvite is one-time', async () => {
        const admin = await seedUser({ role: 'admin' });
        const guest = await seedUser({ role: 'guest', first_name: 'Guest' });
        await InviteCode.create({
            code: 'once-code',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() + 3600000),
        });

        const first = await consumeInvite('once-code', guest._id);
        expect(first).toBeTruthy();
        if (!first) {
            throw new Error('Invite was not consumed');
        }
        expect(first.usedAt).toBeTruthy();

        const second = await consumeInvite('once-code', guest._id);
        expect(second).toBeNull();
    });

    it('multi-use invite stays valid until revoked', async () => {
        const admin = await seedUser({ role: 'admin' });
        const guest = await seedUser({ role: 'guest', first_name: 'Guest' });
        await InviteCode.create({
            code: 'chat-code',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() + 3600000),
            multiUse: true,
        });

        const first = await consumeInvite('chat-code', guest._id);
        const second = await consumeInvite('chat-code', guest._id);
        expect(first).toBeTruthy();
        expect(second).toBeTruthy();
        if (!second) {
            throw new Error('Multi-use invite was not consumed');
        }
        expect(second.usedAt).toBeFalsy();
        expect(second.useCount).toBe(2);
        expect(await findValidInvite('chat-code')).toBeTruthy();

        const revoked = await revokeInvite('chat-code');
        if (!revoked) {
            throw new Error('Invite was not revoked');
        }
        expect(revoked.revokedAt).toBeTruthy();
        expect(await findValidInvite('chat-code')).toBeNull();
        expect(await consumeInvite('chat-code', guest._id)).toBeNull();
    });

    it('listInviteHistory splits live and used/revoked', async () => {
        const admin = await seedUser({ role: 'admin' });
        await InviteCode.create({
            code: 'live-1',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() + 3600000),
        });
        await InviteCode.create({
            code: 'used-1',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() + 3600000),
            usedAt: new Date(),
            usedBy: admin._id,
        });
        await InviteCode.create({
            code: 'revoked-1',
            createdBy: admin._id,
            expiresAt: new Date(Date.now() + 3600000),
            revokedAt: new Date(),
        });

        const { live, history } = await listInviteHistory();
        expect(live.map((i) => i.code)).toContain('live-1');
        expect(history.map((i) => i.code)).toEqual(
            expect.arrayContaining(['used-1', 'revoked-1']),
        );
        expect(live.map((i) => i.code)).not.toContain('used-1');
    });
});
