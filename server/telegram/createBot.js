/**
 * Фабрика Telegraf-бота: команды расписания и регистрация webhook/polling.
 */

const { Telegraf, Markup } = require('telegraf');
const moment = require('moment');
const User = require('../models/User');
const Rehearsal = require('../models/Rehearsal');
const { isAdminLike } = require('../auth/roleHelpers');
const { loadNormalizedDayHours } = require('../booking/createBooking');
const {
    formatDayBookings,
    formatFreeSlots,
    formatMyBookings,
    moscowTodayTomorrow,
} = require('./scheduleMessages');

/**
 * Слоты дня для команд бота.
 * В общий чат formatDayBookings отдаёт только интервалы, без имени и коллектива.
 * @param {string} dateDdMmYyyy - DD/MM/YYYY
 * @returns {Promise<Array<object>>}
 */
const loadHoursForDate = async (dateDdMmYyyy) => {
    const day = await loadNormalizedDayHours(dateDdMmYyyy);
    return day.valid ? day.hours : [];
};

/**
 * Дата начала «сегодня» по Москве → Date для запросов будущих броней.
 * @param {string} dateDdMmYyyy
 * @returns {Date}
 */
const startOfDayUtc = (dateDdMmYyyy) =>
    moment.utc(dateDdMmYyyy, 'DD/MM/YYYY').startOf('day').toDate();

/**
 * Нормализует chat id из env или из Telegram (trim, кавычки, список через запятую).
 * Топики форума не меняют chat.id — у всех топиков одной группы один и тот же id.
 * @param {string|number|null|undefined} value
 * @returns {string[]}
 */
const parseStudioChatIds = (value) => {
    if (value == null || value === '') {
        return [];
    }
    return String(value)
        .split(/[,;\s]+/)
        .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
};

/**
 * Разрешён ли чат для команд расписания.
 * Личка — всегда; группа/супергруппа — только если chat.id в STUDIO_CHAT_ID
 * (один id или несколько через запятую). Топик (message_thread_id) на проверку не влияет.
 * @param {object} ctx
 * @param {string|null} studioChatId
 * @returns {boolean}
 */
const isAllowedChat = (ctx, studioChatId) => {
    const chat = ctx.chat;
    if (!chat) {
        return false;
    }
    if (chat.type === 'private') {
        return true;
    }
    const allowed = parseStudioChatIds(studioChatId);
    if (allowed.length === 0) {
        return false;
    }
    const current = String(chat.id);
    return allowed.includes(current);
};

/**
 * Опции reply с привязкой к топику форума (иначе ответ уходит в General).
 * @param {object} ctx
 * @returns {{ message_thread_id?: number }}
 */
const threadReplyExtra = (ctx) => {
    const threadId = ctx.message?.message_thread_id ?? ctx.callbackQuery?.message?.message_thread_id;
    if (threadId == null) {
        return {};
    }
    return { message_thread_id: threadId };
};

/**
 * Создаёт и настраивает бота (без launch / setWebhook).
 * @param {object} options
 * @param {string} options.botToken
 * @param {string} [options.apiRoot]
 * @param {string} options.webAppBaseUrl - URL мини-приложения (кнопка Web App)
 * @param {string|null} [options.studioChatId]
 * @returns {import('telegraf').Telegraf}
 */
const createBot = ({
    botToken,
    apiRoot = 'https://api.telegram.org',
    webAppBaseUrl = 'https://tuleneva25.ru',
    studioChatId = null,
}) => {
    // apiRoot обязан заканчиваться на `/` (см. server/index.js) — иначе PREFIX воркера
    // выпадает из URL и sendMessage получает 404 Not Found от Worker.
    const normalizedRoot = apiRoot.endsWith('/') ? apiRoot : `${apiRoot}/`;
    const bot = new Telegraf(botToken, {
        telegram: {
            apiRoot: normalizedRoot,
            apiMode: 'bot',
        },
    });

    const appUrl = `${String(webAppBaseUrl).replace(/\/$/, '')}/app`;
    const studioIdRaw = studioChatId != null ? String(studioChatId) : '';
    const studioIds = parseStudioChatIds(studioIdRaw);

    /**
     * @param {object} ctx
     * @param {string} text
     * @param {object} [extra]
     */
    const replyHere = (ctx, text, extra = {}) =>
        ctx.reply(text, { ...threadReplyExtra(ctx), ...extra });

    const denyIfNeeded = async (ctx) => {
        if (isAllowedChat(ctx, studioIdRaw)) {
            return false;
        }
        if (ctx.chat?.type === 'private') {
            return false;
        }
        const configured = studioIds.length > 0 ? studioIds.join(', ') : '(не задан)';
        console.warn(
            'Bot command denied: chat.id=',
            ctx.chat?.id,
            'type=',
            ctx.chat?.type,
            'thread=',
            ctx.message?.message_thread_id,
            'STUDIO_CHAT_ID=',
            configured,
        );
        await replyHere(
            ctx,
            studioIds.length === 0
                ? 'STUDIO_CHAT_ID не задан на сервере. Админ: /chatid в этом чате → вписать id в api.env → restart.'
                : `Этот чат не в списке студии.\nchat.id сейчас: ${ctx.chat.id}\nв env: ${configured}\nАдмин: /chatid и поправьте STUDIO_CHAT_ID.`,
        );
        return true;
    };

    bot.start(async (ctx) => {
        await replyHere(
            ctx,
            'Расписание репетиционной студии «Тюленева 25».',
            Markup.inlineKeyboard([
                [Markup.button.webApp('Расписание студии', appUrl)],
            ]),
        );
    });

    bot.help(async (ctx) => {
        if (await denyIfNeeded(ctx)) {
            return;
        }
        const lines = [
            'Команды:',
            '/today — занятость сегодня',
            '/tomorrow — занятость завтра',
            '/free — свободные слоты сегодня',
            '/help — эта справка',
        ];
        if (ctx.chat?.type === 'private') {
            lines.push('/my — ваши брони');
            lines.push('/start — открыть мини-приложение');
        }
        await replyHere(ctx, lines.join('\n'));
    });

    bot.command('today', async (ctx) => {
        if (await denyIfNeeded(ctx)) {
            return;
        }
        try {
            const { today } = moscowTodayTomorrow();
            const hours = await loadHoursForDate(today);
            await replyHere(ctx, formatDayBookings(today, hours, 'Сегодня'));
        } catch (err) {
            console.error('Bot /today failed:', err?.message || err);
            await replyHere(ctx, 'Не удалось загрузить расписание.');
        }
    });

    bot.command('tomorrow', async (ctx) => {
        if (await denyIfNeeded(ctx)) {
            return;
        }
        try {
            const { tomorrow } = moscowTodayTomorrow();
            const hours = await loadHoursForDate(tomorrow);
            await replyHere(ctx, formatDayBookings(tomorrow, hours, 'Завтра'));
        } catch (err) {
            console.error('Bot /tomorrow failed:', err?.message || err);
            await replyHere(ctx, 'Не удалось загрузить расписание.');
        }
    });

    bot.command('free', async (ctx) => {
        if (await denyIfNeeded(ctx)) {
            return;
        }
        try {
            const { today } = moscowTodayTomorrow();
            const hours = await loadHoursForDate(today);
            await replyHere(ctx, formatFreeSlots(today, hours));
        } catch (err) {
            console.error('Bot /free failed:', err?.message || err);
            await replyHere(ctx, 'Не удалось загрузить расписание.');
        }
    });

    bot.command('my', async (ctx) => {
        if (ctx.chat?.type !== 'private') {
            await replyHere(ctx, 'Команда /my доступна только в личных сообщениях боту.');
            return;
        }
        const tgId = ctx.from?.id;
        if (!tgId) {
            return;
        }
        try {
            const user = await User.findOne({ telegram_id: tgId });
            if (!user) {
                await replyHere(
                    ctx,
                    'Вы ещё не зарегистрированы. Откройте мини-приложение или пройдите по инвайту.',
                );
                return;
            }
            const { today } = moscowTodayTomorrow();
            const from = startOfDayUtc(today);
            const docs = await Rehearsal.find({
                date: { $gte: from },
                'hours.userId': String(user._id),
            }).sort({ date: 1 }).limit(40);
            await replyHere(ctx, formatMyBookings(docs, user._id));
        } catch (err) {
            console.error('Bot /my failed:', err?.message || err);
            await replyHere(ctx, 'Не удалось загрузить ваши брони.');
        }
    });

    bot.command('chatid', async (ctx) => {
        const tgId = ctx.from?.id;
        if (!tgId) {
            return;
        }
        try {
            const user = await User.findOne({ telegram_id: tgId });
            if (!user || !isAdminLike(user.role)) {
                await replyHere(ctx, 'Команда только для администраторов.');
                return;
            }
            const thread = ctx.message?.message_thread_id;
            const match = isAllowedChat(ctx, studioIdRaw);
            const lines = [
                `chat.id = ${ctx.chat.id}`,
                `type = ${ctx.chat.type}${ctx.chat.is_forum ? ' (форум/топики)' : ''}`,
                thread != null ? `message_thread_id = ${thread} (топик; в STUDIO_CHAT_ID его НЕ пишите)` : 'топик: нет (General или обычный чат)',
                `STUDIO_CHAT_ID на сервере: ${studioIds.length ? studioIds.join(', ') : '(не задан)'}`,
                `совпадение: ${match ? 'да' : 'нет'}`,
                '',
                'В /etc/tuleneva/api.env одна строка (id группы один для всех топиков):',
                `STUDIO_CHAT_ID=${ctx.chat.id}`,
                'затем: sudo systemctl restart tuleneva-api',
            ];
            await replyHere(ctx, lines.join('\n'));
        } catch (err) {
            console.error('Bot /chatid failed:', err?.message || err);
            await replyHere(ctx, 'Ошибка.');
        }
    });

    return bot;
};

/**
 * Регистрирует меню команд бота (ошибки только в лог).
 * @param {import('telegraf').Telegraf} bot
 * @returns {Promise<void>}
 */
const registerBotCommands = async (bot) => {
    try {
        await bot.telegram.setMyCommands(
            [
                { command: 'today', description: 'Кто сегодня' },
                { command: 'tomorrow', description: 'Кто завтра' },
                { command: 'free', description: 'Свободные слоты' },
                { command: 'help', description: 'Справка' },
            ],
            { scope: { type: 'all_group_chats' } },
        );
        await bot.telegram.setMyCommands(
            [
                { command: 'start', description: 'Открыть расписание' },
                { command: 'my', description: 'Мои брони' },
                { command: 'today', description: 'Кто сегодня' },
                { command: 'tomorrow', description: 'Кто завтра' },
                { command: 'free', description: 'Свободные слоты' },
                { command: 'help', description: 'Справка' },
            ],
            { scope: { type: 'all_private_chats' } },
        );
    } catch (err) {
        console.error(
            'Telegram setMyCommands failed:',
            err && err.message ? err.message : err,
        );
    }
};

/**
 * Ставит webhook или запускает long polling.
 * @param {object} options
 * @param {import('telegraf').Telegraf} options.bot
 * @param {string|null} options.webhookSecret - Если задан — webhook, иначе polling
 * @param {string} options.webAppBaseUrl
 * @param {string|null} [options.webhookUrl] - Публичный URL для Telegram (например Worker …/hook)
 * @returns {Promise<'webhook'|'polling'>}
 */
const startBotTransport = async ({
    bot,
    webhookSecret,
    webAppBaseUrl,
    webhookUrl = null,
}) => {
    await registerBotCommands(bot);

    if (webhookSecret) {
        const hookUrl = (webhookUrl && String(webhookUrl).trim())
            || `${String(webAppBaseUrl).replace(/\/$/, '')}/api/telegram/webhook`;
        try {
            // drop_pending_updates: false — не теряем очередь; secret обязателен.
            await bot.telegram.callApi('setWebhook', {
                url: hookUrl,
                secret_token: webhookSecret,
                allowed_updates: ['message', 'callback_query'],
            });
            console.log(`Telegram webhook set: ${hookUrl}`);
        } catch (err) {
            console.error(
                'Telegram setWebhook failed; API stays up. Check TELEGRAM_API_ROOT / TELEGRAM_WEBHOOK_URL:',
                err && err.message ? err.message : err,
            );
        }
        return 'webhook';
    }

    bot.launch().catch((err) => {
        console.error(
            'Telegram bot.launch failed; API stays up. Check TELEGRAM_API_ROOT / network to Telegram:',
            err && err.message ? err.message : err,
        );
    });
    console.log('Telegram bot long polling started');
    return 'polling';
};

/**
 * Останавливает polling-бота без падения процесса.
 * @param {import('telegraf').Telegraf} bot
 * @param {string} signal
 */
const stopBotSafely = (bot, signal) => {
    try {
        bot.stop(signal);
    } catch (err) {
        console.warn(
            'Telegram bot.stop skipped:',
            err && err.message ? err.message : err,
        );
    }
};

module.exports = {
    createBot,
    startBotTransport,
    stopBotSafely,
    loadHoursForDate,
    isAllowedChat,
    parseStudioChatIds,
    threadReplyExtra,
};
