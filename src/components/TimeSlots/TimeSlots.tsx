// src/components/TimeSlots/TimeSlots.tsx
import React, { useMemo } from 'react';
import classNames from 'classnames';
import css from '@/components/TimeSlots/TimeSlots.module.css';
import type { IHour } from '@/types/timetable.types.ts';

interface TimeSlotsProps {
    // Other existing props...
    bookedHours: IHour[]; // Full booked data
    selectedHours: string[];
    onHourClick: (hour: string) => void;
    currentUserId: string; // The ID of the currently logged-in user
    isAdmin: boolean; // Flag to indicate if the user is an admin
    isSelectedDayBeforeToday: boolean;
}

const generateHours = () => [
    '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
    '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
];

export const TimeSlots: React.FC<TimeSlotsProps> = (
    {
        bookedHours, // Use the full booking data
        selectedHours,
        onHourClick,
        currentUserId,
        isAdmin,
        isSelectedDayBeforeToday,
    },
) => {
    const hours = useMemo(generateHours, []);

    return (
        <div className={css.timeSlotContainer}>
            {hours.map(hour => {
                const booking = bookedHours.find(b => b.hour === hour);
                const isBooked = !!booking;
                const isMyBooking = booking?.userId === currentUserId;

                // Determine if the slot can be clicked for cancellation
                const canCancel = isBooked && (isAdmin || isMyBooking);
                const isSelected = selectedHours.includes(hour);

                const isDisabledForBooking = isBooked && !canCancel;

                return (
                    <button
                        key={hour}
                        className={classNames(
                            css.timeSlot,
                            {
                                [css.booked]: isBooked,
                                [css.selected]: isSelected && !isBooked,
                                [css.cancelSelected]: isSelected && canCancel,
                                [css.myBooking]: isMyBooking, // Optional: highlight your own bookings
                            },
                        )}
                        onClick={() => {
                            if ((canCancel || !isBooked) && !isSelectedDayBeforeToday) {
                                onHourClick(hour);
                            }
                        }}
                        disabled={isDisabledForBooking}
                    >
                        {hour}
                    </button>
                );
            })}
        </div>
    );
};
