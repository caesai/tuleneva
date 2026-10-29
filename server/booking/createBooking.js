/**
 * Модуль бронирования репетиций: book / cancel / day / month.
 * HTTP-маршруты в app.js — тонкий адаптер поверх этого interface.
 */
const moment = require('moment');

const User = require('../models/User');
const Rehearsal = require('../models/Rehearsal');
const { isAdminLike } = require('../auth/roleHelpers');
const {
    canViewBookingUserDetails,
    sanitizeHoursForViewer,
} = require('../auth/hourPrivacy');
const { isHourAllowed, isSlotInPast } = require('../../shared/studioHours.cjs');

/**
 * Проверяет, является ли строка временем в формате HH:MM.
 * @param {string} str - Строка для проверки
 * @returns {boolean}
 */
const isTimeKey = (str) => /^\d{1,2}:\d{2}$/.test(str);

/**
 * Вычисляет конечное время (начальный час + 1).
 * Например: "23:00" -> "00:00", "12:00" -> "13:00".
 * @param {string} hour - Час в формате "HH:00"
 * @returns {string}
 */
const calculateEndTime = (hour) => {
    const hourNum = parseInt(hour.split(':')[0], 10);
    const nextHour = (hourNum + 1) % 24;
    return `${nextHour.toString().padStart(2, '0')}:00`;
};

/**
 * Извлекает числовое значение часа из строки "HH:00".
 * @param {string} hour - Час в формате "HH:00"
 * @returns {number}
 */
const getHourNumber = (hour) => {
    return parseInt(hour.split(':')[0], 10);
};

/**
 * Объединяет последовательные часы в диапазоны.
 * Например: ["14:00", "15:00", "16:00", "19:00"] -> "14:00 - 17:00, 19:00 - 20:00"
 * @param {string[]} hours - Массив часов
 * @returns {string}
 */
const formatHoursRange = (hours) => {
    if (!hours || hours.length === 0) return '';

    const sortedHours = [...hours].sort((a, b) => getHourNumber(a) - getHourNumber(b));
    const ranges = [];

    let rangeStart = sortedHours[0];
    let rangeEnd = sortedHours[0];

    for (let i = 1; i < sortedHours.length; i++) {
        const current = sortedHours[i];
        const prevHourNum = getHourNumber(rangeEnd);
        const currentHourNum = getHourNumber(current);

        if (currentHourNum === prevHourNum + 1) {
            rangeEnd = current;
        } else {
            ranges.push(`${rangeStart} - ${calculateEndTime(rangeEnd)}`);
            rangeStart = current;
            rangeEnd = current;
        }
    }

    ranges.push(`${rangeStart} - ${calculateEndTime(rangeEnd)}`);

    return ranges.join(', ');
};

/**
 * Конвертирует объект старого формата в массив нового формата.
 * @param {Object} oldFormatObj - Объект старого формата { "12:00": {...}, ... }
 * @returns {Array} Массив нового формата
 */
const convertOldFormatToNew = (oldFormatObj) => {
    const normalizedHours = [];

    for (const [hour, slotData] of Object.entries(oldFormatObj)) {
        if (!isTimeKey(hour)) {
            continue;
        }

        if (!slotData || slotData.status !== 'BOOKED') {
            continue;
        }

        normalizedHours.push({
            hour: hour,
            userId: slotData.userId ? String(slotData.userId) : null,
            username: slotData.owner || '',
            band_name: slotData.bandName || '',
            userPhotoUrl: slotData.avatar || null,
        });
    }

    normalizedHours.sort((a, b) => a.hour.localeCompare(b.hour));

    return normalizedHours;
};

/**
 * Преобразует старый формат бронирований (объект с ключами-часами) в новый формат (массив bookedHourSchema).
 * @param {Object|Array} hoursData - Данные из БД (может быть старый формат или новый)
 * @returns {Array} Массив в новом формате bookedHourSchema
 */
const normalizeHoursData = (hoursData) => {
    if (!hoursData) {
        return [];
    }

    if (Array.isArray(hoursData)) {
        if (hoursData.length === 0) {
            return [];
        }

        const firstItem = hoursData[0];

        if (firstItem && typeof firstItem === 'object' && firstItem.hour) {
            return hoursData;
        }

        if (firstItem && typeof firstItem === 'object') {
            const plainObj = firstItem.toObject ? firstItem.toObject() : firstItem;
            const keys = Object.keys(plainObj);

            if (keys.some(isTimeKey)) {
                return convertOldFormatToNew(plainObj);
            }
        }

        return hoursData;
    }

    if (typeof hoursData === 'object') {
        const plainObj = hoursData.toObject ? hoursData.toObject() : hoursData;
        return convertOldFormatToNew(plainObj);
    }

    return [];
};

/**
 * Создаёт модуль бронирования с инъекцией notify / broadcast.
 * @param {object} deps
 * @param {Function} [deps.broadcastUpdate] - Публикация WebSocket-событий
 * @param {Function} [deps.notifyAdmins] - Уведомление админов в Telegram
 * @param {Function} [deps.notifyUser] - Уведомление пользователя по telegram_id
 * @returns {{ book: Function, cancel: Function, getDayHours: Function, getMonthDates: Function }}
 */
const createBooking = ({
    broadcastUpdate = () => {},
    notifyAdmins = async () => {},
    notifyUser = async () => {},
} = {}) => {
    /**
     * Создаёт бронирование слотов на дату.
     * @param {object} input
     * @param {object} input.dbUser - Пользователь из БД (req.dbUser)
     * @param {string} input.date - Дата DD/MM/YYYY
     * @param {string[]} input.hours - Часы для бронирования
     * @param {string} [input.band_name]
     * @param {string} [input.rehearsalType]
     * @returns {Promise<{ status: number, body: object, afterResponse?: Promise<unknown> }>}
     */
    const book = async ({ dbUser, date, hours, band_name, rehearsalType }) => {
        const username = dbUser.username || dbUser.first_name;
        const userId = dbUser._id;
        const userPhotoUrl = dbUser.photo_url;

        if (dbUser.role === 'guest') {
            return { status: 403, body: { error: 'Guests cannot book rehearsals.' } };
        }

        if (!date || !hours || !Array.isArray(hours) || hours.length === 0) {
            return { status: 400, body: { error: 'Missing or invalid booking data.' } };
        }

        const uniqueHours = [...new Set(hours)];
        if (uniqueHours.length !== hours.length) {
            return { status: 400, body: { error: 'Duplicate hours in booking request.' } };
        }

        const dateMoment = moment.utc(date, 'DD/MM/YYYY', true);
        if (!dateMoment.isValid()) {
            return { status: 400, body: { error: 'Invalid date format. Please use DD/MM/YYYY.' } };
        }

        const invalidHours = uniqueHours.filter((hour) => !isHourAllowed(hour));
        if (invalidHours.length > 0) {
            return {
                status: 400,
                body: {
                    error: 'Hours outside studio schedule (12:00–23:00).',
                    invalidHours,
                },
            };
        }

        const pastHours = uniqueHours.filter((hour) => isSlotInPast(date, hour));
        if (pastHours.length > 0) {
            return {
                status: 400,
                body: {
                    error: 'Cannot book past time slots.',
                    pastHours,
                },
            };
        }

        const bookingDate = dateMoment.startOf('day').toDate();

        let rehearsalDoc = await Rehearsal.findOne({ date: bookingDate });

        if (rehearsalDoc && !Array.isArray(rehearsalDoc.hours)) {
            await Rehearsal.updateOne(
                { _id: rehearsalDoc._id },
                { $set: { hours: [] } },
            );
            rehearsalDoc = await Rehearsal.findOne({ date: bookingDate });
        }

        const newBookings = uniqueHours.map((hour) => ({
            hour,
            userId,
            username,
            band_name: typeof band_name === 'string' ? band_name.trim() : '',
            userPhotoUrl,
            rehearsalType: rehearsalType || 'rehearsal',
        }));

        /**
         * Условный $push: только если ни один из часов ещё не занят.
         * @returns {Promise<object|null>}
         */
        const tryPushHours = () => Rehearsal.findOneAndUpdate(
            {
                date: bookingDate,
                'hours.hour': { $nin: uniqueHours },
            },
            { $push: { hours: { $each: newBookings } } },
            { new: true },
        );

        /**
         * Собирает список уже занятых часов для ответа 409.
         * @returns {Promise<string[]>}
         */
        const loadConflictingHours = async () => {
            const current = await Rehearsal.findOne({ date: bookingDate });
            if (!current || !Array.isArray(current.hours)) {
                return uniqueHours;
            }
            const booked = new Set(current.hours.map((slot) => slot.hour));
            return uniqueHours.filter((hour) => booked.has(hour));
        };

        let updatedRehearsal = await tryPushHours();

        if (!updatedRehearsal && !rehearsalDoc) {
            try {
                updatedRehearsal = await Rehearsal.create({
                    date: bookingDate,
                    hours: newBookings,
                });
            } catch (createErr) {
                if (createErr?.code !== 11000) {
                    throw createErr;
                }
                updatedRehearsal = await tryPushHours();
            }
        }

        if (!updatedRehearsal) {
            const conflictingHours = await loadConflictingHours();
            return {
                status: 409,
                body: {
                    error: 'Some hours are already booked.',
                    conflictingHours,
                },
            };
        }

        console.log('username: ', username, date, uniqueHours.join(','));
        const BOOK_MESSAGE = `
**РЕПЕТИЦИЯ**

👨‍💻 @${username}

📅 ${date.replaceAll('/', '.')} 
🕓 ${formatHoursRange(uniqueHours)}
        `;

        // Push: только занятость дня (без PII). Имена/группа — у getDayHours по роли зрителя.
        broadcastUpdate('booking_update', {
            date,
            hours: sanitizeHoursForViewer(normalizeHoursData(updatedRehearsal.hours), false),
        });

        return {
            status: 201,
            body: updatedRehearsal,
            afterResponse: notifyAdmins(BOOK_MESSAGE),
        };
    };

    /**
     * Отменяет бронирование слотов (свои или любые — для admin-like).
     * @param {object} input
     * @param {object} input.dbUser
     * @param {string} input.date
     * @param {string[]} input.hours
     * @returns {Promise<{ status: number, body: object, afterResponse?: Promise<unknown> }>}
     */
    const cancel = async ({ dbUser, date, hours }) => {
        const username = dbUser.username || dbUser.first_name;
        const userId = dbUser._id;
        const isAdmin = isAdminLike(dbUser.role);

        if (!date || !hours || !Array.isArray(hours) || hours.length === 0) {
            return { status: 400, body: { error: 'Missing or invalid cancellation data.' } };
        }

        const dateMoment = moment.utc(date, 'DD/MM/YYYY');
        if (!dateMoment.isValid()) {
            return { status: 400, body: { error: 'Invalid date format. Expected DD/MM/YYYY.' } };
        }

        const startOfDay = dateMoment.startOf('day').toDate();
        const endOfDay = dateMoment.endOf('day').toDate();

        let rehearsalDoc = await Rehearsal.findOne({
            date: {
                $gte: startOfDay,
                $lte: endOfDay,
            },
        });

        if (!rehearsalDoc) {
            return { status: 404, body: { error: 'No bookings found for this day.' } };
        }

        if (!Array.isArray(rehearsalDoc.hours)) {
            await Rehearsal.updateOne(
                { _id: rehearsalDoc._id },
                { $set: { hours: [] } },
            );
            return { status: 404, body: { error: 'No bookings found for this day.' } };
        }

        const hoursToCancel = hours.filter((hour) => {
            const booking = rehearsalDoc.hours.find((h) => h.hour === hour);
            return booking && (isAdmin || String(booking.userId) === String(userId));
        });

        if (hoursToCancel.length === 0) {
            console.log(`Cancel failed for user ${userId}. Requested: ${hours.join(',')}. Found docs matching user:`,
                rehearsalDoc.hours.filter((h) => hours.includes(h.hour)).map((h) => ({ h: h.hour, u: h.userId })),
            );
            return {
                status: 403,
                body: {
                    error: 'You are not authorized to cancel any of the selected bookings or they do not exist.',
                },
            };
        }

        const updatedRehearsal = await Rehearsal.findOneAndUpdate(
            { _id: rehearsalDoc._id },
            {
                $pull: {
                    hours: {
                        hour: { $in: hoursToCancel },
                        ...(isAdmin ? {} : { userId: userId }),
                    },
                },
            },
            { new: true },
        );

        const CANCEL_MESSAGE_ADMIN = `
**ОТМЕНА**

👨‍💻 @${username}

📅 ${date.replaceAll('/', '.')} 
🕓 ${formatHoursRange(hoursToCancel)}
        `;
        const CANCEL_MESSAGE_USER = `
**ОТМЕНА**
    
📅 ${date.replaceAll('/', '.')}
🕓 ${formatHoursRange(hoursToCancel)}

Репетиция была отменена администратором
        `;

        /**
         * Фоновые Telegram-уведомления после ответа клиенту.
         * @returns {Promise<void>}
         */
        const sendCancelNotifications = async () => {
            if (isAdmin) {
                const affectedUserIds = [...new Set(rehearsalDoc.hours
                    .filter((h) => hoursToCancel.includes(h.hour))
                    .map((h) => h.userId))];

                await Promise.allSettled(
                    affectedUserIds.map(async (affectedUserId) => {
                        try {
                            const affectedUser = await User.findById(affectedUserId);
                            if (affectedUser?.telegram_id) {
                                await notifyUser(affectedUser.telegram_id, CANCEL_MESSAGE_USER);
                            }
                        } catch (e) {
                            console.error(
                                `Failed to notify user ${affectedUserId} about cancellation:`,
                                e?.code || e?.message || e,
                            );
                        }
                    }),
                );
            } else {
                await notifyAdmins(CANCEL_MESSAGE_ADMIN);
            }
        };

        if (updatedRehearsal && updatedRehearsal.hours.length === 0) {
            await Rehearsal.deleteOne({ _id: updatedRehearsal._id });

            broadcastUpdate('booking_cancel', {
                date,
                hours: [],
            });

            return {
                status: 200,
                body: { message: 'All bookings for this day canceled, document deleted.' },
                afterResponse: sendCancelNotifications(),
            };
        }

        if (!updatedRehearsal) {
            return { status: 404, body: { error: 'Booking not found or already canceled.' } };
        }

        // Push: только занятость дня (без PII). Имена/группа — у getDayHours по роли зрителя.
        broadcastUpdate('booking_cancel', {
            date,
            hours: sanitizeHoursForViewer(normalizeHoursData(updatedRehearsal.hours), false),
        });

        return {
            status: 200,
            body: {
                message: 'Bookings canceled successfully.',
                rehearsal: updatedRehearsal,
            },
            afterResponse: sendCancelNotifications(),
        };
    };

    /**
     * Слоты дня с учётом прав зрителя на PII.
     * @param {object} input
     * @param {string} input.date - DD/MM/YYYY
     * @param {object|null|undefined} [input.dbUser] - Пользователь после optional auth
     * @returns {Promise<{ status: number, body: object }>}
     */
    const getDayHours = async ({ date, dbUser }) => {
        if (!date) {
            return { status: 400, body: { message: 'Date query parameter is required.' } };
        }

        const dateMoment = moment.utc(date, 'DD/MM/YYYY');
        if (!dateMoment.isValid()) {
            return { status: 400, body: { message: 'Invalid date format. Expected DD/MM/YYYY.' } };
        }

        const startOfDay = dateMoment.startOf('day').toDate();
        const endOfDay = dateMoment.endOf('day').toDate();

        const rehearsalRecord = await Rehearsal.findOne({
            date: {
                $gte: startOfDay,
                $lte: endOfDay,
            },
        });

        if (!rehearsalRecord) {
            return { status: 200, body: { hours: [] } };
        }

        const normalizedHours = normalizeHoursData(rehearsalRecord.hours);
        const canViewDetails = canViewBookingUserDetails(dbUser);
        const hours = sanitizeHoursForViewer(normalizedHours, canViewDetails);

        return { status: 200, body: { hours } };
    };

    /**
     * Даты месяца с ненулевыми бронированиями (подсветка календаря).
     * @param {object} input
     * @param {string} input.date - Любая дата месяца в DD/MM/YYYY
     * @returns {Promise<{ status: number, body: object }>}
     */
    const getMonthDates = async ({ date }) => {
        if (!date) {
            return { status: 400, body: { error: 'Missing or invalid booking date.' } };
        }
        const dateMoment = moment(date, 'DD/MM/YYYY');
        if (!dateMoment.isValid()) {
            return { status: 400, body: { error: 'Invalid date format. Please use DD/MM/YYYY.' } };
        }

        const dateFrom = dateMoment.startOf('month').toDate();
        const dateTo = dateMoment.endOf('month').toDate();

        const searchResults = await Rehearsal.find({
            date: {
                $gte: dateFrom,
                $lte: dateTo,
            },
            hours: { $ne: [] },
        });

        const datesToHighlight = searchResults.map((doc) => moment(doc.date).format('DD/MM/YYYY'));

        return { status: 200, body: { result: datesToHighlight } };
    };

    return {
        book,
        cancel,
        getDayHours,
        getMonthDates,
    };
};

module.exports = {
    createBooking,
    normalizeHoursData,
    formatHoursRange,
};
