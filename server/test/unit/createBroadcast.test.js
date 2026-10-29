import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBroadcast } from '../../realtime/createBroadcast.js';

/**
 * Фейковый клиент с controllable readyState.
 * @param {number} readyState
 * @returns {{ send: ReturnType<typeof vi.fn>, readyState: number, ping: ReturnType<typeof vi.fn> }}
 */
const fakeClient = (readyState = 1) => ({
    send: vi.fn(),
    readyState,
    ping: vi.fn(),
});

describe('createBroadcast', () => {
    let logSpy;

    beforeEach(() => {
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it('sends envelope to open clients only', () => {
        const { publish, addClient } = createBroadcast();
        const open = fakeClient(1);
        const closed = fakeClient(3);
        addClient(open);
        addClient(closed);

        publish('booking_update', { date: '15/06/2030', hours: [] });

        expect(open.send).toHaveBeenCalledTimes(1);
        expect(closed.send).not.toHaveBeenCalled();

        const payload = JSON.parse(open.send.mock.calls[0][0]);
        expect(payload.type).toBe('booking_update');
        expect(payload.data).toEqual({ date: '15/06/2030', hours: [] });
        expect(typeof payload.timestamp).toBe('number');
    });

    it('remove from addClient stops further publishes', () => {
        const { publish, addClient } = createBroadcast();
        const client = fakeClient(1);
        const remove = addClient(client);

        publish('users_update', { reason: 'test' });
        expect(client.send).toHaveBeenCalledTimes(1);

        remove();
        publish('users_update', { reason: 'again' });
        expect(client.send).toHaveBeenCalledTimes(1);
    });
});
