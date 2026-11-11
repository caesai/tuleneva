import React, { type JSX } from "react"
import { Card } from "@mui/material";
import css from '@/components/RehearsalCard/RehearsalCard.module.css';
import ui from '@/theme/ui.module.css';
import { rehearsalTypeChipClass } from '@/theme/rehearsalChips.ts';
import type { TRehearsalType } from "@/types/timetable.types";
import { SafeAvatar } from '@/components/SafeAvatar/SafeAvatar.tsx';

/**
 * Вычисляет конечное время (начальный час + 1)
 * Например: "23:00" -> "00:00", "12:00" -> "13:00"
 */
const calculateEndTime = (hour: string): string => {
    const hourNum = parseInt(hour.split(':')[0], 10);
    const nextHour = (hourNum + 1) % 24;
    return `${nextHour.toString().padStart(2, '0')}:00`;
};

/**
 * Извлекает числовое значение часа из строки "HH:00"
 */
const getHourNumber = (hour: string): number => {
    return parseInt(hour.split(':')[0], 10);
};

/**
 * Объединяет последовательные часы в диапазоны
 * Например: ["14:00", "15:00", "16:00", "19:00"] -> "14:00 - 17:00, 19:00 - 20:00"
 */
const formatSelectedHoursRange = (hours: string[]): string => {
    if (hours.length === 0) return '';

    const sortedHours = [...hours].sort((a, b) => getHourNumber(a) - getHourNumber(b));
    const ranges: string[] = [];

    let rangeStart = sortedHours[0];
    let rangeEnd = sortedHours[0];

    for (let i = 1; i < sortedHours.length; i++) {
        const current = sortedHours[i];
        const prevHourNum = getHourNumber(rangeEnd);
        const currentHourNum = getHourNumber(current);

        if (currentHourNum === prevHourNum + 1) {
            // Последовательный слот - расширяем диапазон
            rangeEnd = current;
        } else {
            // Не последовательный - сохраняем текущий диапазон и начинаем новый
            ranges.push(`${rangeStart} - ${calculateEndTime(rangeEnd)}`);
            rangeStart = current;
            rangeEnd = current;
        }
    }

    // Добавляем последний диапазон
    ranges.push(`${rangeStart} - ${calculateEndTime(rangeEnd)}`);

    return ranges.join(', ');
};

interface IRehearsalCardProps {
    selectedHours: string[];
    bookingBandName: string;
    photoUrl: string;
    username: string;
    rehearsalType: TRehearsalType;
    canViewUserDetails: boolean;
}

const getAvatarFallback = (username: string, canViewUserDetails: boolean): string => {
    if (!canViewUserDetails) return '?';
    return username.trim().charAt(0).toUpperCase() || '?';
};

export const RehearsalCard: React.FC<IRehearsalCardProps> = ({
    selectedHours,
    bookingBandName,
    photoUrl,
    username,
    rehearsalType = 'rehearsal',
    canViewUserDetails,
}): JSX.Element => {
    const displayName = canViewUserDetails ? username : 'Забронировано';
    const avatarSrc = canViewUserDetails && photoUrl ? photoUrl : undefined;
    const typeLabel = rehearsalType === 'rehearsal'
        ? 'Репетиция'
        : rehearsalType === 'recording'
            ? 'Запись'
            : 'Съемка';

    return (
        <Card className={css.slot} elevation={0}>
            <div className={css.row}>
                <SafeAvatar
                    src={avatarSrc}
                    fallback={getAvatarFallback(username, canViewUserDetails)}
                    timeoutMs={1200}
                    sx={{ width: 44, height: 44, fontSize: 16 }}
                />
                <div className={css.identity}>
                    <p className={css.time}>{formatSelectedHoursRange(selectedHours)}</p>
                    <p className={css.name}>{displayName}</p>
                    {bookingBandName && canViewUserDetails ? (
                        <p className={css.band}>{bookingBandName}</p>
                    ) : null}
                </div>
                <span className={`${ui.chip} ${ui.chipStatic} ${rehearsalTypeChipClass(rehearsalType)}`}>
                    {typeLabel}
                </span>
            </div>
        </Card>
    )
}