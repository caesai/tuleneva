// src/components/TimeSlots/TimeSlots.tsx
import React from 'react';
import classNames from 'classnames';
import css from '@/components/TimeSlots/TimeSlots.module.css';
import type { IHour } from '@/types/timetable.types.ts';
import { SafeAvatar } from '@/components/SafeAvatar/SafeAvatar.tsx';
import { AVAILABLE_HOURS, isSlotInPast } from '../../../shared/studioHours.cjs';

/**
 * Свойства компонента TimeSlots.
 */
interface TimeSlotsProps {
    /** Список всех забронированных часов на выбранную дату */
    bookedHours: IHour[];
    /** Список часов, выбранных пользователем для нового бронирования */
    selectedHours: string[];
    /** Список часов, выбранных пользователем для отмены существующего бронирования */
    hoursToCancel: string[];
    /** Функция обратного вызова при клике на временной слот */
    onHourClick: (hour: string) => void;
    /** ID текущего авторизованного пользователя */
    currentUserId: string;
    /** Флаг, указывающий, является ли текущий пользователь администратором */
    isAdmin: boolean;
    /** Флаг, указывающий, является ли выбранная дата прошедшей (блокирует взаимодействие) */
    isSelectedDayBeforeToday: boolean;
    /** Выбранная дата DD/MM/YYYY (для проверки прошедших слотов по Москве) */
    selectedDateDdMmYyyy: string;
}

const getAvatarFallback = (username?: string): string => {
    return username?.trim().charAt(0).toUpperCase() || '?';
};

/**
 * Компонент TimeSlots
 *
 * Отображает сетку временных слотов для выбранного дня.
 * Позволяет пользователям выбирать свободные слоты для бронирования
 * или выбирать свои существующие бронирования для отмены.
 *
 * Особенности:
 * - Отображает занятые слоты специальным стилем.
 * - Подсвечивает собственные бронирования пользователя.
 * - Блокирует взаимодействие с чужими бронированиями (если не админ) и прошедшими датами.
 *
 * @param props - Свойства компонента.
 */
export const TimeSlots: React.FC<TimeSlotsProps> = (
    {
        bookedHours,
        selectedHours,
        hoursToCancel,
        onHourClick,
        currentUserId,
        isAdmin,
        isSelectedDayBeforeToday,
        selectedDateDdMmYyyy,
    },
) => {
    /**
     * Проверяет, прошло ли уже время слота по Москве.
     * @param slotHour - Время слота в формате "HH:00"
     * @returns true, если слот уже начался или прошёл
     */
    const isSlotTimePassed = (slotHour: string): boolean =>
        isSlotInPast(selectedDateDdMmYyyy, slotHour);

    return (
        <div className={css.timeSlotContainer}>
            {AVAILABLE_HOURS.map(hour => {
                // Поиск бронирования для текущего часа
                const booking = bookedHours.find(b => b.hour === hour);
                const isBooked = !!booking;
                const isMyBooking = String(booking?.userId) === String(currentUserId);

                // Определение, может ли пользователь отменить этот слот (свой или если админ)
                // Приводим ID к строке для корректного сравнения (так как с бэка может прийти в разном формате)
                const canCancel = isBooked && (isAdmin || String(booking?.userId) === String(currentUserId));

                // Состояния выбора
                const isSelectedForBooking = selectedHours.includes(hour);
                const isSelectedForCancellation = hoursToCancel.includes(hour);

                // Слот недоступен, если:
                // 1. Занят кем-то другим и пользователь не админ, ИЛИ
                // 2. Сегодняшний день и время слота уже прошло
                const isDisabledForBooking = (isBooked && !canCancel) || isSlotTimePassed(hour);

                return (
                    <button
                        key={hour}
                        className={classNames(
                            css.timeSlot,
                            {
                                [css.booked]: isBooked,
                                // Слот выбран для нового бронирования (зеленый)
                                [css.selected]: isSelectedForBooking && !isBooked,
                                // Слот выбран для отмены (красный/зачеркнутый)
                                [css.cancelSelected]: isSelectedForCancellation,
                                // Визуальное выделение "моего" бронирования, даже если не выбрано
                                [css.myBooking]: isMyBooking,
                            },
                        )}
                        onClick={() => {
                            // Разрешаем клик, если это отмена доступного слота или бронирование свободного,
                            // и если дата не в прошлом
                            if ((canCancel || !isBooked) && !isSelectedDayBeforeToday) {
                                onHourClick(hour);
                            }
                        }}
                        disabled={isDisabledForBooking}
                        aria-label={`Слот ${hour}, ${isBooked ? 'занят' : 'свободен'}`}
                    >
                        {isBooked ? (
                            <SafeAvatar
                                src={booking?.userPhotoUrl}
                                fallback={getAvatarFallback(booking?.username)}
                                timeoutMs={1200}
                                sx={{ width: 24, height: 24, fontSize: 12 }}
                            />
                        ) : hour}
                    </button>
                );
            })}
        </div>
    );
};
