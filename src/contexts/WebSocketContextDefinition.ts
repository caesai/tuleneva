import { createContext } from 'react';
import type { WebSocketCallback, WebSocketMessage } from '@/hooks/useWebSocket.ts';

/**
 * Общий WebSocket: одно соединение, подписчики по сообщениям.
 */
export interface IWebSocketContext {
    /** Статус соединения */
    isConnected: boolean;
    /** Последнее сообщение */
    lastMessage: WebSocketMessage | null;
    /**
     * Подписка на сообщения.
     * @param callback - Обработчик
     * @returns Отписка
     */
    subscribe: (callback: WebSocketCallback) => () => void;
    /** Принудительное переподключение */
    reconnect: () => void;
}

export const WebSocketContext = createContext<IWebSocketContext | null>(null);
