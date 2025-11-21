// src/pages/TimeTablePage/TimeTablePage.tsx
import React, { useState, useEffect } from 'react';
import { Loader } from '@/components/Loader/Loader.tsx';
import { Calendar } from '@/components/Calendar/Calendar.tsx';
import { TimeSlots } from '@/components/TimeSlots/TimeSlots.tsx';
import { useTimeTableData } from '@/hooks/useTimeTableData.ts';
import moment, { type Moment } from 'moment/moment';
import css from '@/pages/TimeTablePage/TimeTable.module.css';
import { APICancelBooking, APIPostBookRehearsal } from '@/api/timetable.api.ts';
import { ModalPopup } from '@/components/ModalPopup/ModalPopup.tsx';
import { useAuth } from '@/contexts/AuthContext.tsx';

export const TimeTablePage: React.FC = () => {
    const [selectedDate, setSelectedDate] = useState<Moment | null>(moment());
    const [viewDate, setViewDate] = useState<Moment | null>(moment());
    const [selectedHours, setSelectedHours] = useState<string[]>([]);
    const [hoursToCancel, setHoursToCancel] = useState<string[]>([]);
    const { highlightedDates, bookedHours, loading, error, fetchBookedHours, refetch } = useTimeTableData(viewDate);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const openModal = () => setIsModalOpen(true);
    const closeModal = () => setIsModalOpen(false);
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    // Fetch booked hours for the initially selected date (today)
    useEffect(() => {
        if (selectedDate) {
            fetchBookedHours(selectedDate).then();
        }
    }, [selectedDate, fetchBookedHours]);

    useEffect(() => {
        if (error) {
            openModal();
        }
    }, [error]);

    const onDateChange = (newDate: Moment | null) => {
        if (!newDate) return;
        setSelectedDate(newDate);
        setSelectedHours([]);
        setHoursToCancel([]);
    };

    const onMonthChange = (newMonth: Moment) => {
        setViewDate(newMonth); // Update the viewDate state to trigger the API call in the hook
        setSelectedDate(newMonth); // Optionally select the first day of the new month
        setSelectedHours([]);
        setHoursToCancel([]);
    };

    // Handler for selecting/deselecting hours
    const handleHourClick = (hour: string) => {
        // Find if the clicked hour is one of the existing booked hours
        const isBooked = bookedHours.some(b => b.hour === hour);
        const booking = bookedHours.find(b => b.hour === hour);
        const isMyBooking = booking?.userId === user?._id;
        console.log('booking', booking);

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

    const handleBooking = async () => {
        try {
            const response = await APIPostBookRehearsal(moment(selectedDate).format('DD/MM/YYYY'), selectedHours, user?.username, user?._id, 'band_name');
            if (!response.ok) {
                // Handle non-OK response, e.g., show an error message
                throw new Error('Не удалось забронировать время.');
            }
            setSelectedHours([]); // Clear selected hours on success
            await fetchBookedHours(selectedDate as Moment); // Refetch booked hours for the current date
            refetch();
            // Optionally, show a success message to the user
        } catch (error) {
            console.error('Booking failed:', error);
            // Handle error, e.g., show a toast message or update the error state
        }
    };

    const handleCancel = async () => {
        try {
            await APICancelBooking(moment(selectedDate).format('DD/MM/YYYY'), hoursToCancel, user?._id, user?.username);
            // Refresh state after successful cancellation
            setHoursToCancel([]); // Clear hours for cancellation
            await fetchBookedHours(selectedDate as Moment); // Refetch booked hours for the current date
            // Optionally, show a success message to the user
            refetch();
        } catch (error) {
            console.error('Cancellation failed:', error);
            // Handle error, e.g., show a toast message
        }
    };

    if (loading) {
        return <Loader />;
    }

    const isSelectedDayBeforeToday = moment(selectedDate).startOf('day').isBefore(moment().startOf('day'));
    const isBookingEnabled = selectedHours.length > 0;
    const isBookingCancelling = hoursToCancel.length > 0;
    return (
        <div className={css.timetable}>
            <ModalPopup isOpen={isModalOpen} onClose={closeModal}>
                <>
                    {error && (
                        <div className={css.error}>
                            <h3>Возникла ошибка</h3>
                            {error}
                        </div>
                    )}
                </>
            </ModalPopup>
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
                    currentUserId={String(user?._id)}
                    isAdmin={isAdmin}
                    isSelectedDayBeforeToday={isSelectedDayBeforeToday}
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
