// src/pages/TimeTablePage/TimeTablePage.tsx
import React, { useState, useEffect } from 'react';
import { Loader } from '@/components/Loader/Loader.tsx';
import { Calendar } from '@/components/Calendar/Calendar.tsx';
import { TimeSlots } from '@/components/TimeSlots/TimeSlots.tsx';
import { useTimeTableData } from '@/hooks/useTimeTableData.ts';
import moment, { type Moment } from 'moment/moment';
import css from '@/pages/TimeTablePage/TimeTable.module.css';
import { APICancelBooking, APIPostBookRehearsal } from '@/api/timetable.api.ts';

export const TimeTablePage: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState<Moment | null>(moment());
    const [viewDate, setViewDate] = useState<Moment | null>(moment());
    const [selectedHours, setSelectedHours] = useState<string[]>([]);
    const [hoursToCancel, setHoursToCancel] = useState<string[]>([]);
    const { highlightedDates, bookedHours, loading, error, fetchBookedHours } = useTimeTableData(viewDate);
    // Mocked User Data
    const currentUser = { id: 'placeholder_user_id', role: 'user' };
    const isAdmin = currentUser.role === 'admin';
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
    const handleHourClick = (hour: string) => {
        // Find if the clicked hour is one of the existing booked hours
        const isBooked = bookedHours.some(b => b.hour === hour);
        const booking = bookedHours.find(b => b.hour === hour);
        const isMyBooking = booking?.userId === currentUser.id;

        if (isBooked) {
            if (isMyBooking || isAdmin) {
                // Toggle hours for cancellation
                setHoursToCancel(prev =>
                    prev.includes(hour) ? prev.filter(h => h !== hour) : [...prev, hour]
                );
                setSelectedHours([]); // Clear hours for booking
            }
        } else {
            // Toggle hours for new booking
            setSelectedHours(prev =>
                prev.includes(hour) ? prev.filter(h => h !== hour) : [...prev, hour]
            );
            setHoursToCancel([]); // Clear hours for cancellation
        }
    };

    const handleBooking = () => {
        APIPostBookRehearsal(moment(selectedDate).format('DD/MM/YYYY'), selectedHours, 'username', 'band_name').then();
    };

    const handleCancel = async () => {
        try {
            await APICancelBooking(moment(selectedDate).format('DD/MM/YYYY'), hoursToCancel, currentUser.id);
            // Refresh state after successful cancellation
            // setBookedRehearsal(prev => prev.filter(booking => !selectedHours.includes(booking.hour)));
            setSelectedHours([]);
        } catch (error) {
            console.error('Cancellation failed:', error);
            // Handle error, e.g., show a toast message
        }
    };

    if (loading) {
        return <Loader />;
    }

    if (error) {
        return <div className={css.error}>{error}</div>;
    }

    const isBookingEnabled = selectedHours.length > 0;
    const isBookingCancelling = hoursToCancel.length > 0;
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
                    currentUserId={currentUser.id}
                    isAdmin={false}
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
                {isBookingCancelling && (
                    <div className={css.bookingButtonContainer}>
                        <button
                            className={css.bookingButton}
                            onClick={handleCancel}
                        >
                            Отменить
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
