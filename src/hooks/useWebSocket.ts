// src/hooks/useWebSocket.ts
import { useEffect, useRef, useCallback, useState } from 'react';
import { getWebSocketUrl } from '@/api/base.api';
import type { IHour } from '@/types/timetable.types';

/**
 * Типы событий WebSocket
 */
export type WebSocketEventType = 'booking_update' | 'booking_cancel';

/**
 * Интерфейс сообщения WebSocket
 */
export interface WebSocketMessage {
    type: WebSocketEventType;
    data: {
        date: string;
        hours: IHour[];
    };
    timestamp: number;
}

/**
 * Callback функция для обработки сообщений
 */
export type WebSocketCallback = (message: WebSocketMessage) => void;

/**
 * Параметры для useWebSocket хука
 */
interface UseWebSocketOptions {
    /** Callback, вызываемый при получении сообщения */
    onMessage?: WebSocketCallback;
    /** Автоматическое переподключение при потере связи */
    autoReconnect?: boolean;
    /** Интервал переподключения в мс */
    reconnectInterval?: number;
    /** Максимальное количество попыток переподключения */
    maxReconnectAttempts?: number;
}

/**
 * Возвращаемые значения хука useWebSocket
 */
interface UseWebSocketReturn {
    /** Статус соединения */
    isConnected: boolean;
    /** Последнее полученное сообщение */
    lastMessage: WebSocketMessage | null;
    /** Функция для принудительного переподключения */
    reconnect: () => void;
}

/**
 * Хук для управления WebSocket соединением.
 * Обеспечивает автоматическое переподключение и обработку сообщений.
 *
 * @param options - Параметры подключения
 * @returns {UseWebSocketReturn} Объект с состоянием соединения и методами управления
 */
export const useWebSocket = (options: UseWebSocketOptions = {}): UseWebSocketReturn => {
    const {
        onMessage,
        autoReconnect = true,
        reconnectInterval = 3000,
        maxReconnectAttempts = 10
    } = options;

    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
    
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onMessageRef = useRef(onMessage);

    // Обновляем ref при изменении callback
    useEffect(() => {
        onMessageRef.current = onMessage;
    }, [onMessage]);

    /**
     * Очищает таймаут переподключения
     */
    const clearReconnectTimeout = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
    }, []);

    /**
     * Создает и настраивает WebSocket соединение
     */
    const connect = useCallback(() => {
        // Закрываем существующее соединение
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
                    
                    if (onMessageRef.current) {
                        onMessageRef.current(message);
                    }
                } catch (err) {
                    console.error('Failed to parse WebSocket message:', err);
                }
            };

            ws.onclose = (event) => {
                console.log('WebSocket disconnected', event.code, event.reason);
                setIsConnected(false);
                wsRef.current = null;

                // Автоматическое переподключение
                if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
                    clearReconnectTimeout();
                    reconnectTimeoutRef.current = setTimeout(() => {
                        reconnectAttemptsRef.current++;
                        console.log(`WebSocket reconnecting... Attempt ${reconnectAttemptsRef.current}`);
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

    /**
     * Принудительное переподключение
     */
    const reconnect = useCallback(() => {
        reconnectAttemptsRef.current = 0;
        clearReconnectTimeout();
        connect();
    }, [connect, clearReconnectTimeout]);

    // Подключение при монтировании, отключение при размонтировании
    useEffect(() => {
        connect();

        return () => {
            clearReconnectTimeout();
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect, clearReconnectTimeout]);

    return {
        isConnected,
        lastMessage,
        reconnect
    };
};
