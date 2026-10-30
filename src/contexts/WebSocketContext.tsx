/**
 * @file Провайдер одного WebSocket-соединения на всё приложение.
 */
import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { getWebSocketUrl } from '@/api/base.api';
import type {
    WebSocketCallback,
    WebSocketMessage,
} from '@/hooks/useWebSocket.ts';
import { WebSocketContext } from './WebSocketContextDefinition.ts';

interface WebSocketProviderProps {
    children: ReactNode;
    /** Автоматическое переподключение */
    autoReconnect?: boolean;
    /** Интервал переподключения в мс */
    reconnectInterval?: number;
    /** Максимум попыток переподключения */
    maxReconnectAttempts?: number;
}

/**
 * Держит одно WS-соединение; компоненты подписываются через {@link useWebSocket}.
 */
export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({
    children,
    autoReconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
}) => {
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const subscribersRef = useRef(new Set<WebSocketCallback>());

    const clearReconnectTimeout = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
    }, []);

    const connect = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.close();
        }

        try {
            const url = getWebSocketUrl();
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('WebSocket connected');
                setIsConnected(true);
                reconnectAttemptsRef.current = 0;
            };

            ws.onmessage = (event) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data);
                    setLastMessage(message);
                    subscribersRef.current.forEach((cb) => {
                        try {
                            cb(message);
                        } catch (err) {
                            console.error('WebSocket subscriber error:', err);
                        }
                    });
                } catch (err) {
                    console.error('Failed to parse WebSocket message:', err);
                }
            };

            ws.onclose = (event) => {
                console.log('WebSocket disconnected', event.code, event.reason);
                if (wsRef.current !== ws) {
                    return;
                }
                setIsConnected(false);
                wsRef.current = null;

                if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
                    clearReconnectTimeout();
                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttemptsRef.current++;
                        console.log(
                            `WebSocket reconnecting... Attempt ${reconnectAttemptsRef.current}`,
                        );
                        connect();
                    }, reconnectInterval);
                }
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        } catch (err) {
            console.error('Failed to create WebSocket connection:', err);
        }
    }, [autoReconnect, reconnectInterval, maxReconnectAttempts, clearReconnectTimeout]);

    const reconnect = useCallback(() => {
        reconnectAttemptsRef.current = 0;
        clearReconnectTimeout();
        connect();
    }, [connect, clearReconnectTimeout]);

    /**
     * @param callback - Обработчик сообщений
     * @returns Функция отписки
     */
    const subscribe = useCallback((callback: WebSocketCallback) => {
        subscribersRef.current.add(callback);
        return () => {
            subscribersRef.current.delete(callback);
        };
    }, []);

    useEffect(() => {
        connect();
        return () => {
            clearReconnectTimeout();
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            subscribersRef.current.clear();
        };
    }, [connect, clearReconnectTimeout]);

    return (
        <WebSocketContext.Provider
            value={{ isConnected, lastMessage, subscribe, reconnect }}
        >
            {children}
        </WebSocketContext.Provider>
    );
};
