/**
 * @file Подписка на общий WebSocket из {@link WebSocketProvider}.
 */
import { useEffect, useRef, useState, useContext } from 'react';
import type { IHour } from '@/types/timetable.types';
import { WebSocketContext } from '@/contexts/WebSocketContextDefinition.ts';

/**
 * Типы событий WebSocket
 */
export type WebSocketEventType = 'booking_update' | 'booking_cancel' | 'users_update';

/**
 * Интерфейс сообщения WebSocket
 */
export interface WebSocketMessage {
    type: WebSocketEventType;
    data: {
        /** Дата слота (booking_*) */
        date?: string;
        /** Часы слота (booking_*) */
        hours?: IHour[];
        /** Причина users_update (register, invite, role_change, …) */
        reason?: string;
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
 * Подписка на общее WebSocket-соединение приложения.
 *
 * @param options - Параметры подписки
 * @returns Состояние соединения и методы
 */
export const useWebSocket = (options: UseWebSocketOptions = {}): UseWebSocketReturn => {
    const { onMessage } = options;
    const ctx = useContext(WebSocketContext);
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
    const onMessageRef = useRef(onMessage);

    useEffect(() => {
        onMessageRef.current = onMessage;
    }, [onMessage]);

    useEffect(() => {
        if (!ctx) {
            return;
        }
        return ctx.subscribe((message) => {
            setLastMessage(message);
            onMessageRef.current?.(message);
        });
    }, [ctx]);

    if (!ctx) {
        throw new Error('useWebSocket must be used within a WebSocketProvider');
    }

    return {
        isConnected: ctx.isConnected,
        lastMessage: lastMessage ?? ctx.lastMessage,
        reconnect: ctx.reconnect,
    };
};
