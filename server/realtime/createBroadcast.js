/**
 * Модуль realtime-публикации: registry клиентов, envelope и WebSocket на /ws.
 * createApp получает publish как broadcastUpdate; тесты подключают фейковых клиентов через addClient.
 */
const { WebSocketServer } = require('ws');

/** @description Интервал ping для удержания соединения за Nginx (мс). */
const HEARTBEAT_MS = 25000;

/**
 * Клиент для publish: send + readyState (+ ping для heartbeat).
 * @typedef {{ send: Function, readyState: number, ping?: Function }} BroadcastClient
 */

/**
 * Создаёт модуль публикации обновлений по WebSocket.
 * @returns {{ publish: Function, addClient: Function, attach: Function }}
 */
const createBroadcast = () => {
    /** @type {Set<BroadcastClient>} */
    const clients = new Set();

    /**
     * Рассылает событие всем открытым клиентам.
     * Контракт совпадает с бывшим broadcastUpdate(type, data).
     * @param {string} type - Тип события (booking_update, booking_cancel, users_update, …)
     * @param {object} data - Полезная нагрузка
     * @returns {void}
     */
    const publish = (type, data) => {
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
    const addClient = (client) => {
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
    const attach = (httpServer) => {
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
        const stop = () => {
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

module.exports = {
    createBroadcast,
    HEARTBEAT_MS,
};
