import moment, { type Moment } from '@/lib/moment';
import { formatDdMmYyyyMoscow } from '../../shared/studioHours.ts';

/**
 * Календарный день, который в Москве уже наступил.
 * Момент стоит на локальной полуночи этой даты: ячейка календаря
 * и строка DD/MM/YYYY совпадают с сутками студии, а не с поясом браузера.
 * @param now Опорный момент времени
 * @returns Начало суток студии
 */
export const studioTodayMoment = (now: Date = new Date()): Moment => (
    moment(formatDdMmYyyyMoscow(now), 'DD/MM/YYYY', true)
);
