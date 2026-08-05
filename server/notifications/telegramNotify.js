/**
 * Надёжная отправка Telegram-уведомлений с таймаутом и без блокировки HTTP.
 */

/** @description Таймаут одного sendMessage по умолчанию (мс). */
const DEFAULT_TIMEOUT_MS = 8000;

/**
 * Формирует краткое описание ошибки для логов (без полного FetchError).
 * @param {unknown} err
 * @returns {string}
 */
const formatNotifyError = (err) => {
    if (!err || typeof err !== 'object') {
        return String(err);
    }
    const e = /** @type {{ code?: string, errno?: string, name?: string, message?: string }} */ (err);
    const code = e.code || e.errno || e.name || 'Error';
    const message = typeof e.message === 'string' ? e.message.split('\n')[0] : String(err);
    return `${code}: ${message}`;
};

/**
 * Оборачивает промис отправки: ошибки только в лог, HTTP-путь не ждёт.
 * @param {Promise<unknown>} promise
 * @returns {void}
 */
const safeNotify = (promise) => {
    void Promise.resolve(promise).catch((err) => {
        console.error('Background telegram notify failed:', formatNotifyError(err));
    });
};

/**
 * Отправляет сообщение в Telegram с ограничением по времени.
 * @param {object} bot - Экземпляр Telegraf
 * @param {string|number} chatId - telegram_id / chat_id
 * @param {string} text - Текст сообщения
 * @param {object} [extra] - Доп. параметры sendMessage (parse_mode, reply_markup, …)
 * @param {number} [timeoutMs] - Таймаут в мс
 * @returns {Promise<unknown>}
 */
const sendTelegramMessage = async (
    bot,
    chatId,
    text,
    extra,
    timeoutMs = DEFAULT_TIMEOUT_MS,
) => {
    if (!bot?.telegram || chatId == null || chatId === '') {
        return undefined;
    }

    const sendPromise = extra
        ? bot.telegram.sendMessage(chatId, text, extra)
        : bot.telegram.sendMessage(chatId, text);
    // Не оставляем unhandled rejection, если выиграли по таймауту
    sendPromise.catch(() => {});

    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(`Telegram sendMessage timed out after ${timeoutMs}ms`);
            err.code = 'NOTIFY_TIMEOUT';
            reject(err);
        }, timeoutMs);
    });

    try {
        return await Promise.race([sendPromise, timeoutPromise]);
    } finally {
        clearTimeout(timer);
    }
};

/**
 * Создаёт функцию уведомления всех админов (admin / super_admin) с telegram_id.
 * Отправка параллельная; ошибки по отдельным чатам логируются и не пробрасываются.
 *
 * @param {object} options
 * @param {object} options.bot - Экземпляр Telegraf
 * @param {import('mongoose').Model} options.User - Модель User
 * @param {number} [options.timeoutMs] - Таймаут одного сообщения
 * @returns {(message: string, extra?: object) => Promise<void>}
 */
const createNotifyAdmins = ({ bot, User, timeoutMs = DEFAULT_TIMEOUT_MS }) => {
    /**
     * Уведомляет всех админов с привязанным Telegram.
     * @param {string} message
     * @param {object} [extra]
     * @returns {Promise<void>}
     */
    return async (message, extra) => {
        if (!bot?.telegram) {
            return;
        }

        let admins;
        try {
            admins = await User.find({ role: { $in: ['admin', 'super_admin'] } });
        } catch (err) {
            console.error('Failed to fetch admins for notification:', formatNotifyError(err));
            return;
        }

        const targets = admins.filter((admin) => admin.telegram_id);
        await Promise.allSettled(
            targets.map(async (admin) => {
                try {
                    await sendTelegramMessage(bot, admin.telegram_id, message, extra, timeoutMs);
                } catch (err) {
                    console.error(
                        `Failed to send notification to admin ${admin.telegram_id}:`,
                        formatNotifyError(err),
                    );
                }
            }),
        );
    };
};

module.exports = {
    DEFAULT_TIMEOUT_MS,
    formatNotifyError,
    safeNotify,
    sendTelegramMessage,
    createNotifyAdmins,
};
