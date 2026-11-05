/**
 * Модуль realtime-публикации: registry клиентов, envelope и WebSocket на /ws.
 * createApp получает publish как broadcastUpdate; тесты подключают фейковых клиентов через addClient.
 */
import { WebSocketServer } from 'ws';

/** @description Интервал ping для удержания соединения за Nginx (мс). */
const HEARTBEAT_MS = 25000;

/**
 * Клиент рассылки: send и readyState, ping опционален для heartbeat.
 */
interface BroadcastClient {
    send: (data: string) => void;
    readyState: number;
    ping?: () => void;
}

/**
 * Публикация событий, регистрация клиентов и привязка WebSocket к HTTP-серверу.
 */
interface Broadcast {
    publish: (type: string, data: object) => void;
    addClient: (client: BroadcastClient) => () => void;
    attach: (httpServer: import('http').Server) => () => void;
}

/**
 * Создаёт модуль публикации обновлений по WebSocket.
 * @returns {Broadcast} publish, addClient и attach
 */
const createBroadcast = (): Broadcast => {
    const clients = new Set<BroadcastClient>();

    /**
     * Рассылает событие всем открытым клиентам.
     * Контракт совпадает с бывшим broadcastUpdate(type, data).
     * @param {string} type - Тип события (booking_update, booking_cancel, users_update, …)
     * @param {object} data - Полезная нагрузка
     * @returns {void}
     */
    const publish = (type: string, data: object): void => {
        const message = JSON.stringify({ type, data, timestamp: Date.now() });
        clients.forEach((client) => {
            if (client.readyState === 1) {
                client.send(message);
            }
        });
        console.log(`Broadcast sent: ${type} to ${clients.size} clients`);
    };

    /**
     * Добавляет клиента в registry (сокет или фейк в тестах).
     * @param {BroadcastClient} client
     * @returns {() => void} Функция снятия клиента
     */
    const addClient = (client: BroadcastClient): () => void => {
        clients.add(client);
        return () => {
            clients.delete(client);
        };
    };

    /**
     * Вешает WebSocketServer на HTTP-сервер (path /ws).
     * @param {import('http').Server} httpServer
     * @returns {() => void} stop — heartbeat + закрытие сокетов и WSS
     */
    const attach = (httpServer: import('http').Server): () => void => {
        const wss = new WebSocketServer({
            server: httpServer,
            path: '/ws',
            // Safari/WebKit за Nginx рвёт сокет с «network connection was lost», если включено сжатие кадров.
            perMessageDeflate: false,
        });

        wss.on('connection', (ws) => {
            console.log('WebSocket client connected');
            const remove = addClient(ws);

            ws.on('close', () => {
                console.log('WebSocket client disconnected');
                remove();
            });

            ws.on('error', (err) => {
                console.error('WebSocket error:', err);
                remove();
            });
        });

        const heartbeat = setInterval(() => {
            clients.forEach((ws) => {
                if (ws.readyState === 1 && typeof ws.ping === 'function') {
                    ws.ping();
                }
            });
        }, HEARTBEAT_MS);
        heartbeat.unref?.();

        /**
         * Останавливает heartbeat и закрывает WebSocket-сервер.
         * @returns {void}
         */
        const stop = (): void => {
            clearInterval(heartbeat);
            try {
                wss.clients.forEach((ws) => {
                    try {
                        ws.close();
                    } catch {
                        // ignore
                    }
                });
                wss.close();
            } catch (err) {
                console.warn('WebSocket close:', err?.message || err);
            }
        };

        return stop;
    };

    return {
        publish,
        addClient,
        attach,
    };
};

export {
    createBroadcast,
    HEARTBEAT_MS,
};
