/**
 * Типы для shared/studioHours.cjs (клиентский TypeScript).
 */

export const AVAILABLE_HOURS: readonly string[];
export const MOSCOW_TZ: string;

export function isHourAllowed(hour: string): boolean;
export function isSlotInPast(
    dateDdMmYyyy: string,
    hour: string,
    now?: Date,
): boolean;
export function parseDdMmYyyy(
    dateDdMmYyyy: string,
): { year: number; month: number; day: number } | null;
export function getMoscowNowParts(now?: Date): {
    year: number;
    month: number;
    day: number;
    hour: number;
};
export function formatDdMmYyyyMoscow(date: Date): string;
export function addMoscowDaysDdMmYyyy(deltaDays: number, now?: Date): string;
