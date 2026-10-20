import { describe, it, expect } from 'vitest';
import {
    isAllowedChat,
    parseStudioChatIds,
} from '../../telegram/createBot.js';

describe('parseStudioChatIds / isAllowedChat', () => {
    it('parses single and comma-separated ids', () => {
        expect(parseStudioChatIds('-100123')).toEqual(['-100123']);
        expect(parseStudioChatIds(' -1001, -1002 ; -1003 ')).toEqual([
            '-1001',
            '-1002',
            '-1003',
        ]);
        expect(parseStudioChatIds('"-100"')).toEqual(['-100']);
    });

    it('allows private chats always', () => {
        expect(isAllowedChat({ chat: { id: 1, type: 'private' } }, null)).toBe(true);
        expect(isAllowedChat({ chat: { id: 1, type: 'private' } }, '-100')).toBe(true);
    });

    it('denies groups when STUDIO_CHAT_ID empty', () => {
        expect(isAllowedChat({ chat: { id: -1001, type: 'supergroup' } }, null)).toBe(false);
        expect(isAllowedChat({ chat: { id: -1001, type: 'supergroup' } }, '')).toBe(false);
    });

    it('matches group id; topic thread does not matter', () => {
        const ctx = {
            chat: { id: -100555, type: 'supergroup', is_forum: true },
            message: { message_thread_id: 42 },
        };
        expect(isAllowedChat(ctx, '-100555')).toBe(true);
        expect(isAllowedChat(ctx, '-100999')).toBe(false);
        expect(isAllowedChat(ctx, '-100999,-100555')).toBe(true);
    });
});
