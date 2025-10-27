// src/components/TimeSlots/TimeSlots.tsx
import React, { useMemo } from 'react';
import classNames from 'classnames';
import css from '@/components/TimeSlots/TimeSlots.module.css';

interface TimeSlotsProps {
    bookedHours: string[];
    selectedHours: string[];
    onHourClick: (hour: string) => void;
}

const generateHours = () => [
    '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
    '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
];

export const TimeSlots: React.FC<TimeSlotsProps> = ({ bookedHours, selectedHours, onHourClick }) => {
    const hours = useMemo(generateHours, []);

    return (
        <div className={css.timeSlotContainer}>
            {hours.map(hour => {
                const isBooked = bookedHours.includes(hour);
                const isSelected = selectedHours.includes(hour);

                return (
                    <button
                        key={hour}
                        className={classNames(
                            css.timeSlot,
                            {
                                [css.booked]: isBooked,
                                [css.selected]: isSelected,
                            },
                        )}
                        onClick={() => onHourClick(hour)}
                        disabled={isBooked}
                    >
                        {hour}
                    </button>
                );
            })}
        </div>
    );
};
