import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import InviteCode from '../../models/InviteCode.js';
import { findValidInvite, consumeInvite } from '../../auth/inviteService.js';
import {
    connectTestDb,
    disconnectTestDb,
    clearTestDb,
    seedUser,
} from '../helpers/testApp.js';

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
        expect(first.usedAt).toBeTruthy();

        const second = await consumeInvite('once-code', guest._id);
        expect(second).toBeNull();
    });
});
