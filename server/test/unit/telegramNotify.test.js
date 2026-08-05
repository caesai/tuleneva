import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    formatNotifyError,
    safeNotify,
    sendTelegramMessage,
    createNotifyAdmins,
} from '../../notifications/telegramNotify.js';

describe('formatNotifyError', () => {
    it('returns code and first line of message', () => {
        const err = new Error('request to https://api.telegram.org/bot1:SECRET/sendMessage failed');
        err.code = 'ETIMEDOUT';
        expect(formatNotifyError(err)).toBe(
            'ETIMEDOUT: request to https://api.telegram.org/bot1:SECRET/sendMessage failed',
        );
    });

    it('falls back for non-objects', () => {
        expect(formatNotifyError('boom')).toBe('boom');
    });
});

describe('safeNotify', () => {
    it('swallows rejected promises and logs briefly', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const err = new Error('network down');
        err.code = 'ETIMEDOUT';

        safeNotify(Promise.reject(err));
        await vi.waitFor(() => {
            expect(spy).toHaveBeenCalled();
        });

        expect(spy.mock.calls[0][0]).toBe('Background telegram notify failed:');
        expect(spy.mock.calls[0][1]).toContain('ETIMEDOUT');
        spy.mockRestore();
    });
});

describe('sendTelegramMessage', () => {
    it('skips when bot or chatId missing', async () => {
        await expect(sendTelegramMessage(null, 1, 'hi')).resolves.toBeUndefined();
        await expect(
            sendTelegramMessage({ telegram: { sendMessage: vi.fn() } }, null, 'hi'),
        ).resolves.toBeUndefined();
    });

    it('passes extra to sendMessage', async () => {
        const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });
        const bot = { telegram: { sendMessage } };
        const extra = { parse_mode: 'Markdown' };

        await sendTelegramMessage(bot, 42, 'hello', extra, 1000);

        expect(sendMessage).toHaveBeenCalledWith(42, 'hello', extra);
    });

    it('rejects with NOTIFY_TIMEOUT when send hangs', async () => {
        vi.useFakeTimers();
        const sendMessage = vi.fn().mockReturnValue(new Promise(() => {}));
        const bot = { telegram: { sendMessage } };

        const pending = sendTelegramMessage(bot, 1, 'slow', undefined, 50);
        const assertion = expect(pending).rejects.toMatchObject({ code: 'NOTIFY_TIMEOUT' });
        await vi.advanceTimersByTimeAsync(50);
        await assertion;
        vi.useRealTimers();
    });
});

describe('createNotifyAdmins', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('skips admins without telegram_id and sends in parallel', async () => {
        const sendMessage = vi.fn().mockResolvedValue({});
        const bot = { telegram: { sendMessage } };
        const User = {
            find: vi.fn().mockResolvedValue([
                { telegram_id: 111, role: 'admin' },
                { telegram_id: null, role: 'admin' },
                { telegram_id: 222, role: 'super_admin' },
            ]),
        };

        const notifyAdmins = createNotifyAdmins({ bot, User, timeoutMs: 1000 });
        await notifyAdmins('hello');

        expect(sendMessage).toHaveBeenCalledTimes(2);
        expect(sendMessage).toHaveBeenCalledWith(111, 'hello');
        expect(sendMessage).toHaveBeenCalledWith(222, 'hello');
    });

    it('logs timeout without throwing', async () => {
        vi.useFakeTimers();
        const sendMessage = vi.fn().mockReturnValue(new Promise(() => {}));
        const bot = { telegram: { sendMessage } };
        const User = {
            find: vi.fn().mockResolvedValue([{ telegram_id: 999, role: 'admin' }]),
        };

        const notifyAdmins = createNotifyAdmins({ bot, User, timeoutMs: 40 });
        const done = notifyAdmins('ping');
        await vi.advanceTimersByTimeAsync(40);
        await done;

        expect(console.error).toHaveBeenCalledWith(
            'Failed to send notification to admin 999:',
            expect.stringContaining('NOTIFY_TIMEOUT'),
        );
        vi.useRealTimers();
    });

    it('returns early when bot is missing', async () => {
        const User = { find: vi.fn() };
        const notifyAdmins = createNotifyAdmins({ bot: null, User });
        await notifyAdmins('noop');
        expect(User.find).not.toHaveBeenCalled();
    });
});
