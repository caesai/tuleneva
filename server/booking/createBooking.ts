/**
 * Модуль бронирования репетиций: book / cancel / day / month.
 * HTTP-маршруты в app.ts — тонкий адаптер поверх этого interface.
 */
import moment from 'moment';

import User, { type UserDocument } from '../models/User';
import Rehearsal, { type RehearsalDocument } from '../models/Rehearsal';
import { isAdminLike } from '../auth/roleHelpers';
import {
    canViewBookingUserDetails,
    sanitizeHoursForViewer,
} from '../auth/hourPrivacy';
import { isHourAllowed, isSlotInPast } from '../../shared/studioHours';

/**
 * Проверяет, является ли строка временем в формате HH:MM.
 * @param {string} str - Строка для проверки
 * @returns {boolean}
 */
const isTimeKey = (str: string): boolean => /^\d{1,2}:\d{2}$/.test(str);

/**
 * Вычисляет конечное время (начальный час + 1).
 * Например: "23:00" -> "00:00", "12:00" -> "13:00".
 * @param {string} hour - Час в формате "HH:00"
 * @returns {string}
 */
const calculateEndTime = (hour: string): string => {
    const hourNum = parseInt(hour.split(':')[0], 10);
    const nextHour = (hourNum + 1) % 24;
    return `${nextHour.toString().padStart(2, '0')}:00`;
};

/**
 * Извлекает числовое значение часа из строки "HH:00".
 * @param {string} hour - Час в формате "HH:00"
 * @returns {number}
 */
const getHourNumber = (hour: string): number => {
    return parseInt(hour.split(':')[0], 10);
};

/**
 * Объединяет последовательные часы в диапазоны.
 * Например: ["14:00", "15:00", "16:00", "19:00"] -> "14:00 - 17:00, 19:00 - 20:00"
 * @param {string[]} hours - Массив часов
 * @returns {string}
 */
const formatHoursRange = (hours: string[]): string => {
    if (!hours || hours.length === 0) return '';

    const sortedHours = [...hours].sort((a, b) => getHourNumber(a) - getHourNumber(b));
    const ranges: string[] = [];

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
/** Слот старого формата: ключ — час, значение — объект брони. */
type LegacyBookedSlot = {
    status?: string;
    userId?: unknown;
    owner?: string;
    bandName?: string;
    avatar?: string | null;
    rehearsalType?: string;
};

/** Слот после конвертации. `rehearsalType` есть только если он был в старых данных. */
type NormalizedLegacySlot = {
    hour: string;
    userId: string | null;
    username: string;
    band_name: string;
    userPhotoUrl: string | null;
    rehearsalType?: string;
};

const convertOldFormatToNew = (
    oldFormatObj: Record<string, LegacyBookedSlot | null | undefined>,
): NormalizedLegacySlot[] => {
    const normalizedHours: NormalizedLegacySlot[] = [];

    for (const [hour, slotData] of Object.entries(oldFormatObj)) {
        if (!isTimeKey(hour)) {
            continue;
        }

        if (!slotData || slotData.status !== 'BOOKED') {
            continue;
        }

        const slot: NormalizedLegacySlot = {
            hour,
            userId: slotData.userId ? String(slotData.userId) : null,
            username: slotData.owner || '',
            band_name: slotData.bandName || '',
            userPhotoUrl: slotData.avatar || null,
        };
        if (slotData.rehearsalType) {
            slot.rehearsalType = String(slotData.rehearsalType);
        }
        normalizedHours.push(slot);
    }

    normalizedHours.sort((a, b) => a.hour.localeCompare(b.hour));

    return normalizedHours;
};

/**
 * Преобразует старый формат бронирований (объект с ключами-часами) в новый формат (массив bookedHourSchema).
 * @param {Object|Array} hoursData - Данные из БД (может быть старый формат или новый)
 * @returns {Array} Массив в новом формате bookedHourSchema
 */
/**
 * Снимает обёртку Mongoose, если она есть.
 * @param value Объект слота или документ
 * @returns Плоский объект для разбора ключей-часов
 */
const asLegacyRecord = (
    value: object,
): Record<string, LegacyBookedSlot | null | undefined> => {
    if ('toObject' in value && typeof value.toObject === 'function') {
        return value.toObject() as Record<string, LegacyBookedSlot | null | undefined>;
    }
    return value as Record<string, LegacyBookedSlot | null | undefined>;
};

const normalizeHoursData = (hoursData: unknown) => {
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
            const plainObj = asLegacyRecord(firstItem);
            const keys = Object.keys(plainObj);

            if (keys.some(isTimeKey)) {
                return convertOldFormatToNew(plainObj);
            }
        }

        return hoursData;
    }

    if (typeof hoursData === 'object') {
        const plainObj = asLegacyRecord(hoursData);
        return convertOldFormatToNew(plainObj);
    }

    return [];
};

/** Границы календарного дня в UTC. */
interface StudioDayBounds {
    start: Date;
    end: Date;
}

/**
 * Строго разбирает DD/MM/YYYY в интервал UTC-суток.
 * Дата вроде 32/01/2030 не переносится на соседний день.
 * @param date Строка даты
 * @returns Начало и конец дня либо null
 */
const parseStudioDay = (date: unknown): StudioDayBounds | null => {
    if (typeof date !== 'string' || date.length === 0) {
        return null;
    }
    const parsed = moment.utc(date, 'DD/MM/YYYY', true);
    if (!parsed.isValid()) {
        return null;
    }
    const start = parsed.clone().startOf('day');
    return {
        start: start.toDate(),
        end: start.clone().endOf('day').toDate(),
    };
};

/**
 * Условие поиска документа дня: любая метка внутри UTC-суток.
 * @param bounds Границы дня
 * @returns Фильтр MongoDB
 */
const dayFilter = (bounds: StudioDayBounds) => ({
    date: { $gte: bounds.start, $lte: bounds.end },
});

/**
 * Готовит legacy-слоты к записи в bookedHourSchema.
 * @param slots Нормализованные слоты
 * @returns Массив для поля hours
 */
const toStoredHours = (slots: NormalizedLegacySlot[]) => slots.map((slot) => ({
    hour: slot.hour,
    userId: slot.userId ?? '',
    username: slot.username,
    band_name: slot.band_name,
    userPhotoUrl: slot.userPhotoUrl,
    rehearsalType: slot.rehearsalType || 'rehearsal',
}));

/**
 * Ошибка уникального индекса MongoDB.
 * @param err Пойманная ошибка
 * @returns true для кода 11000
 */
const isDuplicateKey = (err: unknown): boolean => (
    typeof err === 'object'
    && err !== null
    && 'code' in err
    && (err as { code?: unknown }).code === 11000
);

/**
 * Переписывает объектный legacy-hours в массив, не стирая занятые слоты.
 * Тип поля читается из BSON: Mongoose иногда показывает такой объект как массив.
 * @param doc Документ дня
 * @returns Документ с массивом hours
 */
const ensureHoursArray = async (doc: RehearsalDocument): Promise<RehearsalDocument | null> => {
    // Mongoose может отдать объектный legacy как массив. Тип смотрим в BSON.
    const raw = await Rehearsal.collection.findOne(
        { _id: doc._id },
        { projection: { hours: 1 } },
    );
    const rawHours = raw?.hours;
    if (!rawHours || typeof rawHours !== 'object' || Array.isArray(rawHours)) {
        return doc;
    }

    await Rehearsal.updateOne(
        { _id: doc._id },
        { $set: { hours: toStoredHours(normalizeHoursData(rawHours)) } },
    );
    return Rehearsal.findById(doc._id);
};

/**
 * Загружает и нормализует слоты дня (UTC-окно как у GET /api/hours).
 * Общий day-read для HTTP и бота; PII режет вызывающий код.
 * @param date Дата DD/MM/YYYY
 * @returns valid: false, если дата не разобрана
 */
const loadNormalizedDayHours = async (date: unknown) => {
    const bounds = parseStudioDay(date);
    if (!bounds) {
        return { valid: false, hours: [] };
    }

    const rehearsalRecord = await Rehearsal.findOne(dayFilter(bounds));
    if (!rehearsalRecord) {
        return { valid: true, hours: [] };
    }

    const ready = await ensureHoursArray(rehearsalRecord);
    return {
        valid: true,
        hours: normalizeHoursData(ready?.hours),
    };
};

/**
 * Создаёт модуль бронирования с инъекцией notify / broadcast.
 * @param {object} deps
 * @param {Function} [deps.broadcastUpdate] - Публикация WebSocket-событий
 * @param {Function} [deps.notifyAdmins] - Уведомление админов в Telegram
 * @param {Function} [deps.notifyUser] - Уведомление пользователя по telegram_id
 * @returns {{ book: Function, cancel: Function, getDayHours: Function, getMonthDates: Function }}
 */
/** Ответ book/cancel/day/month для HTTP-адаптера. */
interface BookingHttpResult {
    status: number;
    body: {
        error?: string;
        message?: string;
        hours?: unknown;
        invalidHours?: unknown;
        pastHours?: unknown;
        conflictingHours?: unknown;
        canceledHours?: string[];
        rehearsal?: unknown;
        result?: string[];
    };
    afterResponse?: () => Promise<unknown>;
}

interface BookingDeps {
    /** Публикация WebSocket-событий. */
    broadcastUpdate?: (event: string, payload: unknown) => void;
    /** Уведомление админов в Telegram. */
    notifyAdmins?: (message: string) => Promise<unknown> | unknown;
    /** Уведомление пользователя по telegram_id. */
    notifyUser?: (telegramId: number, message: string) => Promise<unknown> | unknown;
}

const createBooking = ({
    broadcastUpdate = () => {},
    notifyAdmins = async () => {},
    notifyUser = async () => {},
}: BookingDeps = {}) => {
    /**
     * Создаёт бронирование слотов на дату.
     * @param {object} input
     * @param {import('../models/User').UserDocument} input.dbUser - Пользователь из БД после verifyUserExists
     * @param {string} input.date - Дата DD/MM/YYYY
     * @param {string[]} input.hours - Часы для бронирования
     * @param {string} [input.band_name]
     * @param {string} [input.rehearsalType]
     * @returns {Promise<{ status: number, body: object, afterResponse?: () => Promise<unknown> }>}
     */
    const book = async ({
        dbUser,
        date,
        hours,
        band_name,
        rehearsalType,
    }: {
        dbUser: UserDocument;
        date?: unknown;
        hours?: unknown;
        band_name?: unknown;
        rehearsalType?: unknown;
    }): Promise<BookingHttpResult> => {
        const username = dbUser.username || dbUser.first_name;
        const userId = dbUser._id;
        const userPhotoUrl = dbUser.photo_url;

        if (dbUser.role === 'guest') {
            return { status: 403, body: { error: 'Guests cannot book rehearsals.' } };
        }

        if (typeof date !== 'string' || !hours || !Array.isArray(hours) || hours.length === 0) {
            return { status: 400, body: { error: 'Missing or invalid booking data.' } };
        }

        const uniqueHours = [...new Set(hours)];
        if (uniqueHours.length !== hours.length) {
            return { status: 400, body: { error: 'Duplicate hours in booking request.' } };
        }

        const bounds = parseStudioDay(date);
        if (!bounds) {
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

        let rehearsalDoc = await Rehearsal.findOne(dayFilter(bounds));
        if (rehearsalDoc) {
            rehearsalDoc = await ensureHoursArray(rehearsalDoc);
        }

        const newBookings = uniqueHours.map((hour) => ({
            hour,
            userId,
            username,
            band_name: typeof band_name === 'string' ? band_name.trim() : '',
            userPhotoUrl,
            rehearsalType: typeof rehearsalType === 'string' && rehearsalType
                ? rehearsalType
                : 'rehearsal',
        }));

        /**
         * Условный $push в уже найденный документ: только если ни один из часов не занят.
         * @param docId Документ дня
         * @returns Обновлённый документ или null, если слот уже занят
         */
        const pushOnto = (docId: RehearsalDocument['_id']) => Rehearsal.findOneAndUpdate(
            {
                _id: docId,
                'hours.hour': { $nin: uniqueHours },
            },
            { $push: { hours: { $each: newBookings } } },
            { new: true },
        );

        /**
         * Собирает список уже занятых часов для ответа 409.
         * @returns Часы из запроса, которые уже есть в документе дня
         */
        const loadConflictingHours = async () => {
            const current = await Rehearsal.findOne(dayFilter(bounds));
            if (!current) {
                return uniqueHours;
            }
            const ready = await ensureHoursArray(current);
            if (!ready || !Array.isArray(ready.hours)) {
                return uniqueHours;
            }
            const booked = new Set(ready.hours.map((slot) => slot.hour));
            return uniqueHours.filter((hour) => booked.has(hour));
        };

        let updatedRehearsal = rehearsalDoc ? await pushOnto(rehearsalDoc._id) : null;

        if (!updatedRehearsal && !rehearsalDoc) {
            try {
                updatedRehearsal = await Rehearsal.create({
                    date: bounds.start,
                    hours: newBookings,
                });
            } catch (createErr) {
                if (!isDuplicateKey(createErr)) {
                    throw createErr;
                }
                const winner = await Rehearsal.findOne(dayFilter(bounds));
                if (winner) {
                    const ready = await ensureHoursArray(winner);
                    if (ready) {
                        updatedRehearsal = await pushOnto(ready._id);
                    }
                }
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
            afterResponse: () => Promise.resolve(notifyAdmins(BOOK_MESSAGE)),
        };
    };

    /**
     * Отменяет бронирование слотов (свои или любые — для admin-like).
     * @param {object} input
     * @param {import('../models/User').UserDocument} input.dbUser - Пользователь из БД после verifyUserExists
     * @param {string} input.date
     * @param {string[]} input.hours
     * @returns {Promise<{ status: number, body: object, afterResponse?: () => Promise<unknown> }>}
     */
    const cancel = async ({
        dbUser,
        date,
        hours,
    }: {
        dbUser: UserDocument;
        date?: unknown;
        hours?: unknown;
    }): Promise<BookingHttpResult> => {
        const username = dbUser.username || dbUser.first_name;
        const userId = dbUser._id;
        const isAdmin = isAdminLike(dbUser.role);

        if (typeof date !== 'string' || !hours || !Array.isArray(hours) || hours.length === 0) {
            return { status: 400, body: { error: 'Missing or invalid cancellation data.' } };
        }

        const bounds = parseStudioDay(date);
        if (!bounds) {
            return { status: 400, body: { error: 'Invalid date format. Expected DD/MM/YYYY.' } };
        }

        const requestedHours = [...new Set(
            hours.filter((hour): hour is string => typeof hour === 'string'),
        )];
        if (requestedHours.length !== hours.length) {
            return { status: 400, body: { error: 'Missing or invalid cancellation data.' } };
        }

        const found = await Rehearsal.findOne(dayFilter(bounds));
        if (!found) {
            return { status: 404, body: { error: 'No bookings found for this day.' } };
        }

        const rehearsalDoc = await ensureHoursArray(found);
        if (!rehearsalDoc || rehearsalDoc.hours.length === 0) {
            return { status: 404, body: { error: 'No bookings found for this day.' } };
        }

        const targets = rehearsalDoc.hours.filter((booking) => (
            requestedHours.includes(booking.hour)
            && (isAdmin || String(booking.userId) === String(userId))
        ));

        if (targets.length === 0) {
            console.log(`Cancel failed for user ${userId}. Requested: ${requestedHours.join(',')}. Found docs matching user:`,
                rehearsalDoc.hours
                    .filter((slot) => requestedHours.includes(slot.hour))
                    .map((slot) => ({ h: slot.hour, u: slot.userId })),
            );
            return {
                status: 403,
                body: {
                    error: 'You are not authorized to cancel any of the selected bookings or they do not exist.',
                },
            };
        }

        // Снимаем пару hour+userId, прочитанную выше. Чужая новая бронь того же часа остаётся.
        const updatedRehearsal = await Rehearsal.findOneAndUpdate(
            { _id: rehearsalDoc._id },
            [
                {
                    $set: {
                        hours: {
                            $filter: {
                                input: { $ifNull: ['$hours', []] },
                                as: 'slot',
                                cond: {
                                    $not: {
                                        $or: targets.map((booking) => ({
                                            $and: [
                                                { $eq: ['$$slot.hour', booking.hour] },
                                                { $eq: ['$$slot.userId', String(booking.userId)] },
                                            ],
                                        })),
                                    },
                                },
                            },
                        },
                    },
                },
            ],
            { new: true },
        );

        if (!updatedRehearsal) {
            return { status: 404, body: { error: 'Booking not found or already canceled.' } };
        }

        const canceledHours = [...new Set(
            targets
                .filter((target) => !updatedRehearsal.hours.some((slot) => slot.hour === target.hour))
                .map((target) => target.hour),
        )];

        if (canceledHours.length === 0) {
            return {
                status: 409,
                body: { error: 'Selected bookings changed. Refresh and try again.' },
            };
        }

        const CANCEL_MESSAGE_ADMIN = `
**ОТМЕНА**

👨‍💻 @${username}

📅 ${date.replaceAll('/', '.')} 
🕓 ${formatHoursRange(canceledHours)}
        `;
        const CANCEL_MESSAGE_USER = `
**ОТМЕНА**
    
📅 ${date.replaceAll('/', '.')}
🕓 ${formatHoursRange(canceledHours)}

Репетиция была отменена администратором
        `;

        /**
         * Фоновые Telegram-уведомления после ответа клиенту.
         * Пишет только про слоты, которые $pull действительно снял.
         * @returns Promise уведомлений
         */
        const sendCancelNotifications = async () => {
            if (isAdmin) {
                const affectedUserIds = [...new Set(rehearsalDoc.hours
                    .filter((slot) => canceledHours.includes(slot.hour))
                    .map((slot) => slot.userId))];

                await Promise.allSettled(
                    affectedUserIds.map(async (affectedUserId) => {
                        try {
                            const affectedUser = await User.findById(affectedUserId);
                            if (affectedUser?.telegram_id) {
                                await notifyUser(affectedUser.telegram_id, CANCEL_MESSAGE_USER);
                            }
                        } catch (e) {
                            const detail = e instanceof Error ? e.message : e;
                            console.error(
                                `Failed to notify user ${affectedUserId} about cancellation:`,
                                detail,
                            );
                        }
                    }),
                );
            } else {
                await notifyAdmins(CANCEL_MESSAGE_ADMIN);
            }
        };

        if (updatedRehearsal.hours.length === 0) {
            await Rehearsal.deleteOne({ _id: updatedRehearsal._id });

            broadcastUpdate('booking_cancel', {
                date,
                hours: [],
            });

            return {
                status: 200,
                body: {
                    message: 'All bookings for this day canceled, document deleted.',
                    canceledHours,
                },
                afterResponse: () => sendCancelNotifications(),
            };
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
                canceledHours,
                rehearsal: updatedRehearsal,
            },
            afterResponse: () => sendCancelNotifications(),
        };
    };

    /**
     * Слоты дня с учётом прав зрителя на PII.
     * @param {object} input
     * @param {string} input.date - DD/MM/YYYY
     * @param {import('../models/User').UserDocument|null|undefined} [input.dbUser] - Пользователь после optional auth
     * @returns {Promise<{ status: number, body: object }>}
     */
    const getDayHours = async ({
        date,
        dbUser,
    }: {
        date?: unknown;
        dbUser?: UserDocument | null;
    }): Promise<BookingHttpResult> => {
        if (!date) {
            return { status: 400, body: { message: 'Date query parameter is required.' } };
        }

        const day = await loadNormalizedDayHours(date);
        if (!day.valid) {
            return { status: 400, body: { message: 'Invalid date format. Expected DD/MM/YYYY.' } };
        }

        const canViewDetails = canViewBookingUserDetails(dbUser);
        const hours = sanitizeHoursForViewer(day.hours, canViewDetails);

        return { status: 200, body: { hours } };
    };

    /**
     * Даты месяца с ненулевыми бронированиями (подсветка календаря).
     * @param {object} input
     * @param {string} input.date - Любая дата месяца в DD/MM/YYYY
     * @returns {Promise<{ status: number, body: object }>}
     */
    const getMonthDates = async ({ date }: { date?: unknown }): Promise<BookingHttpResult> => {
        if (typeof date !== 'string' || date.length === 0) {
            return { status: 400, body: { error: 'Missing or invalid booking date.' } };
        }
        const bounds = parseStudioDay(date);
        if (!bounds) {
            return { status: 400, body: { error: 'Invalid date format. Please use DD/MM/YYYY.' } };
        }

        const monthStart = moment.utc(bounds.start).startOf('month').toDate();
        const monthEnd = moment.utc(bounds.start).endOf('month').toDate();

        const searchResults = await Rehearsal.find({
            date: {
                $gte: monthStart,
                $lte: monthEnd,
            },
            $or: [
                { 'hours.0': { $exists: true } },
                { hours: { $type: 'object' } },
            ],
        });

        const datesToHighlight = searchResults.map((doc) => moment.utc(doc.date).format('DD/MM/YYYY'));

        return { status: 200, body: { result: datesToHighlight } };
    };

    return {
        book,
        cancel,
        getDayHours,
        getMonthDates,
    };
};

export {
    createBooking,
    normalizeHoursData,
    loadNormalizedDayHours,
    formatHoursRange,
};
