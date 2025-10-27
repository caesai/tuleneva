// src/pages/TimeTablePage/TimeTablePage.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Loader } from '@/components/Loader/Loader.tsx';
import { Calendar } from '@/components/Calendar/Calendar.tsx';
import { TimeSlots } from '@/components/TimeSlots/TimeSlots.tsx';
import { useTimeTableData } from '@/hooks/useTimeTableData.ts';
import moment, { type Moment } from 'moment/moment';
import css from '@/pages/TimeTablePage/TimeTable.module.css';

export const TimeTablePage: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState<Moment | null>(moment());
    const [viewDate, setViewDate] = useState<Moment | null>(moment());
    const [selectedHours, setSelectedHours] = useState<string[]>([]); // State lifted
    const { highlightedDates, bookedHours, loading, error, fetchBookedHours } = useTimeTableData(viewDate);

    // Fetch booked hours for the initially selected date (today)
    useEffect(() => {
        if (selectedDate) {
            fetchBookedHours(selectedDate).then();
        }
    }, [selectedDate, fetchBookedHours]);

    const onDateChange = (newDate: Moment | null) => {
        if (!newDate) return;
        setSelectedDate(newDate);
        setSelectedHours([]);
    };

    const onMonthChange = (newMonth: Moment) => {
        setViewDate(newMonth); // Update the viewDate state to trigger the API call in the hook
        setSelectedDate(newMonth); // Optionally select the first day of the new month
        setSelectedHours([]);
    };

    // Handler for selecting/deselecting hours
    const handleHourClick = useCallback((hour: string) => {
        setSelectedHours(prevSelectedHours => {
            if (prevSelectedHours.includes(hour)) {
                return prevSelectedHours.filter(h => h !== hour);
            } else {
                return [...prevSelectedHours, hour];
            }
        });
    }, []);

    const handleBooking = () => {
        // Implement your booking logic here
        console.log(`Booking for date: ${selectedDate?.format('DD/MM/YYYY')} at times: ${selectedHours.join(', ')}`);
        // e.g., call an API
    };

    if (loading) {
        return <Loader />;
    }

    if (error) {
        return <div className={css.error}>{error}</div>;
    }

    const isBookingEnabled = selectedHours.length > 0;

    return (
        <div className={css.timetable}>
            <h2>Расписание студии</h2>
            <div className={css.card}>
                <Calendar
                    onDateChange={onDateChange}
                    onMonthChange={onMonthChange}
                    date={selectedDate}
                    highlightedDates={highlightedDates}
                />
                <TimeSlots
                    bookedHours={bookedHours}
                    selectedHours={selectedHours}
                    onHourClick={handleHourClick}
                />
                {isBookingEnabled && (
                    <div className={css.bookingButtonContainer}>
                        <button
                            className={css.bookingButton}
                            onClick={handleBooking}
                        >
                            Забронировать
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
