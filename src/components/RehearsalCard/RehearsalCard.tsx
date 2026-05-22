import React, { type JSX } from "react"
import { Card, Chip } from "@mui/material";
import css from '@/components/RehearsalCard/RehearsalCard.module.css';
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

    return (
        <Card className={css.slot}>
            <div className={css.timeContainer}>
                <SafeAvatar
                    src={avatarSrc}
                    fallback={getAvatarFallback(username, canViewUserDetails)}
                    timeoutMs={1200}
                    className={css.avatar}
                    sx={{ width: 36, height: 36, border: '1px solid' }}
                />
                <div className={css.usernameContainer}>
                    <span className={css.username}>{displayName}</span>
                    <span className={css.time}>🕓 {formatSelectedHoursRange(selectedHours)}</span>
                </div>
            </div>
            {bookingBandName && canViewUserDetails && (
                <div className={css.timeContainer} style={{ marginTop: '10px' }}>
                    <span className={css.bandIcon}>🎸 </span>
                    <span className={css.bandName}>{bookingBandName}</span>
                </div>
            )}
            <div className={css.rehearsalTypes}>
                <Chip
                    variant="outlined"
                    color={rehearsalType === 'rehearsal' ? 'info' : rehearsalType === 'recording' ? 'error' : 'success'}
                    size="small" label={rehearsalType === 'rehearsal' ? 'Репетиция' : rehearsalType === 'recording' ? 'Запись' : 'Съемка'}
                    sx={{ fontSize: 10, marginTop: '5px' }}
                />
            </div>
        </Card>
    )
}