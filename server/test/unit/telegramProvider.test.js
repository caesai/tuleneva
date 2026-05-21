import { describe, it, expect } from 'vitest';
import {
    verifyTelegramInitData,
    parseTelegramUser,
} from '../../auth/telegramProvider.js';
import { buildInitData } from '../fixtures/buildInitData.js';

const BOT_TOKEN = 'test-bot-token';

describe('telegramProvider', () => {
    const user = { id: 12345, first_name: 'Test', username: 'tester' };

    it('verifyTelegramInitData accepts valid HMAC', () => {
        const initData = buildInitData(user, BOT_TOKEN);
        expect(verifyTelegramInitData(initData, BOT_TOKEN)).toBe(true);
    });

    it('verifyTelegramInitData rejects invalid hash', () => {
        const initData = buildInitData(user, BOT_TOKEN) + 'tampered';
        expect(verifyTelegramInitData(initData, BOT_TOKEN)).toBe(false);
    });

    it('parseTelegramUser returns user on valid data', () => {
        const initData = buildInitData(user, BOT_TOKEN);
        const tg = parseTelegramUser(initData, BOT_TOKEN);
        expect(tg.user.id).toBe(12345);
    });

    it('parseTelegramUser throws on invalid signature', () => {
        expect(() => parseTelegramUser('user=%7B%7D&hash=bad', BOT_TOKEN)).toThrow(
            'Invalid Telegram data signature',
        );
    });

    it('parseTelegramUser throws when user id missing', () => {
        const initData = buildInitData({}, BOT_TOKEN);
        expect(() => parseTelegramUser(initData, BOT_TOKEN)).toThrow(
            'Invalid Telegram user payload',
        );
    });
});
