// src/components/TimeSlots/TimeSlots.tsx
import React from 'react';
import classNames from 'classnames';
import css from '@/components/TimeSlots/TimeSlots.module.css';
import type { IHour } from '@/types/timetable.types.ts';

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
}

/** Список доступных для бронирования часов (статическая конфигурация) */
const AVAILABLE_HOURS = [
    '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
    '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
];

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
    },
) => {
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

                // Слот недоступен, если он занят кем-то другим, и пользователь не админ
                const isDisabledForBooking = isBooked && !canCancel;

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
                        {hour}
                    </button>
                );
            })}
        </div>
    );
};
