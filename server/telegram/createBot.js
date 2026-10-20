/**
 * Фабрика Telegraf-бота: команды расписания и регистрация webhook/polling.
 */

const { Telegraf, Markup } = require('telegraf');
const moment = require('moment');
const User = require('../models/User');
const Rehearsal = require('../models/Rehearsal');
const { isAdminLike } = require('../auth/roleHelpers');
const {
    formatDayBookings,
    formatFreeSlots,
    formatMyBookings,
    moscowTodayTomorrow,
} = require('./scheduleMessages');

/**
 * Загружает слоты на календарный день DD/MM/YYYY (UTC start/end как в /api/hours).
 * @param {string} dateDdMmYyyy
 * @returns {Promise<Array<object>>}
 */
const loadHoursForDate = async (dateDdMmYyyy) => {
    const dateMoment = moment.utc(dateDdMmYyyy, 'DD/MM/YYYY');
    if (!dateMoment.isValid()) {
        return [];
    }
    const startOfDay = dateMoment.startOf('day').toDate();
    const endOfDay = dateMoment.clone().endOf('day').toDate();
    const doc = await Rehearsal.findOne({
        date: { $gte: startOfDay, $lte: endOfDay },
    });
    return doc && Array.isArray(doc.hours) ? doc.hours : [];
};

/**
 * Дата начала «сегодня» по Москве → Date для запросов будущих броней.
 * @param {string} dateDdMmYyyy
 * @returns {Date}
 */
const startOfDayUtc = (dateDdMmYyyy) =>
    moment.utc(dateDdMmYyyy, 'DD/MM/YYYY').startOf('day').toDate();

/**
 * Разрешён ли чат для команд расписания.
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
    if (!studioChatId) {
        return false;
    }
    return String(chat.id) === String(studioChatId);
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
    const bot = new Telegraf(botToken, {
        telegram: { apiRoot },
    });

    const appUrl = `${String(webAppBaseUrl).replace(/\/$/, '')}/app`;
    const studioId = studioChatId ? String(studioChatId) : null;

    const denyIfNeeded = async (ctx) => {
        if (isAllowedChat(ctx, studioId)) {
            return false;
        }
        if (ctx.chat?.type === 'private') {
            return false;
        }
        await ctx.reply('Команды расписания доступны только в чате студии.');
        return true;
    };

    bot.start(async (ctx) => {
        await ctx.reply(
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
            '/today — кто сегодня',
            '/tomorrow — кто завтра',
            '/free — свободные слоты сегодня',
            '/help — эта справка',
        ];
        if (ctx.chat?.type === 'private') {
            lines.push('/my — ваши брони');
            lines.push('/start — открыть мини-приложение');
        }
        await ctx.reply(lines.join('\n'));
    });

    bot.command('today', async (ctx) => {
        if (await denyIfNeeded(ctx)) {
            return;
        }
        try {
            const { today } = moscowTodayTomorrow();
            const hours = await loadHoursForDate(today);
            await ctx.reply(formatDayBookings(today, hours, 'Сегодня'));
        } catch (err) {
            console.error('Bot /today failed:', err?.message || err);
            await ctx.reply('Не удалось загрузить расписание.');
        }
    });

    bot.command('tomorrow', async (ctx) => {
        if (await denyIfNeeded(ctx)) {
            return;
        }
        try {
            const { tomorrow } = moscowTodayTomorrow();
            const hours = await loadHoursForDate(tomorrow);
            await ctx.reply(formatDayBookings(tomorrow, hours, 'Завтра'));
        } catch (err) {
            console.error('Bot /tomorrow failed:', err?.message || err);
            await ctx.reply('Не удалось загрузить расписание.');
        }
    });

    bot.command('free', async (ctx) => {
        if (await denyIfNeeded(ctx)) {
            return;
        }
        try {
            const { today } = moscowTodayTomorrow();
            const hours = await loadHoursForDate(today);
            await ctx.reply(formatFreeSlots(today, hours));
        } catch (err) {
            console.error('Bot /free failed:', err?.message || err);
            await ctx.reply('Не удалось загрузить расписание.');
        }
    });

    bot.command('my', async (ctx) => {
        if (ctx.chat?.type !== 'private') {
            await ctx.reply('Команда /my доступна только в личных сообщениях боту.');
            return;
        }
        const tgId = ctx.from?.id;
        if (!tgId) {
            return;
        }
        try {
            const user = await User.findOne({ telegram_id: tgId });
            if (!user) {
                await ctx.reply(
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
            await ctx.reply(formatMyBookings(docs, user._id));
        } catch (err) {
            console.error('Bot /my failed:', err?.message || err);
            await ctx.reply('Не удалось загрузить ваши брони.');
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
                await ctx.reply('Команда только для администраторов.');
                return;
            }
            await ctx.reply(
                `chat_id этого чата: ${ctx.chat.id}\n`
                + 'Добавьте в api.env: STUDIO_CHAT_ID='
                + `${ctx.chat.id}\n`
                + 'и перезапустите tuleneva-api.',
            );
        } catch (err) {
            console.error('Bot /chatid failed:', err?.message || err);
            await ctx.reply('Ошибка.');
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
 * @returns {Promise<'webhook'|'polling'>}
 */
const startBotTransport = async ({
    bot,
    webhookSecret,
    webAppBaseUrl,
}) => {
    await registerBotCommands(bot);

    if (webhookSecret) {
        const hookUrl = `${String(webAppBaseUrl).replace(/\/$/, '')}/api/telegram/webhook`;
        try {
            await bot.telegram.setWebhook(hookUrl, {
                secret_token: webhookSecret,
            });
            console.log(`Telegram webhook set: ${hookUrl}`);
        } catch (err) {
            console.error(
                'Telegram setWebhook failed; API stays up. Check TELEGRAM_API_ROOT:',
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
};
