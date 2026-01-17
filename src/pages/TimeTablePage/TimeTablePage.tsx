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
import { useAuth } from '@/hooks/useAuth.ts';

/**
 * Компонент TimeTablePage
 *
 * Этот компонент отображает главную страницу расписания, где пользователи могут просматривать график,
 * выбирать даты, а также бронировать или отменять часы репетиций.
 *
 * Основные функции:
 * - Отображает календарь для выбора даты.
 * - Показывает временные слоты для выбранной даты, указывая забронированные и доступные часы.
 * - Позволяет авторизованным пользователям бронировать свободные часы.
 * - Позволяет авторизованным пользователям (или администраторам) отменять свои бронирования.
 * - Обрабатывает взаимодействие с API для бронирования и отмены.
 * - Управляет состоянием выбранной даты, часов для бронирования и часов для отмены.
 *
 * @returns {React.FC} Отрисованный компонент TimeTablePage.
 */
export const TimeTablePage: React.FC = () => {
    // Состояние для текущей выбранной даты в календаре
    const [selectedDate, setSelectedDate] = useState<Moment | null>(moment());
    // Состояние для текущего просматриваемого месяца (влияет на загружаемые данные)
    const [viewDate, setViewDate] = useState<Moment | null>(moment());
    // Состояние для часов, выбранных для бронирования
    const [selectedHours, setSelectedHours] = useState<string[]>([]);
    // Состояние для часов, выбранных для отмены
    const [hoursToCancel, setHoursToCancel] = useState<string[]>([]);
    // Пользовательский хук для получения данных расписания (подсвеченные даты, забронированные часы)
    const { highlightedDates, bookedHours, loading, error, fetchBookedHours, refetch } = useTimeTableData(viewDate);
    // Состояние видимости модального окна с ошибкой
    const [isModalOpen, setIsModalOpen] = useState(false);

    const openModal = () => setIsModalOpen(true);
    const closeModal = () => setIsModalOpen(false);
    const { user, register } = useAuth();
    const isAdmin = user?.role === 'admin';
    const isGuest = user?.role === 'guest';
    const isUnregistered = user && !user.isRegistered && !user._id;

    // Загрузка забронированных часов для изначально выбранной даты (сегодня) при монтировании или изменении selectedDate
    useEffect(() => {
        if (selectedDate) {
            fetchBookedHours(selectedDate).then();
        }
    }, [selectedDate, fetchBookedHours]);

    // Показать модальное окно, если произошла ошибка при загрузке данных
    useEffect(() => {
        if (error) {
            openModal();
        }
    }, [error]);

    /**
     * Обрабатывает изменение даты в компоненте Calendar.
     * Сбрасывает выбранные часы и часы для отмены.
     *
     * @param {Moment | null} newDate - Новая выбранная дата.
     */
    const onDateChange = (newDate: Moment | null) => {
        if (!newDate) return;
        setSelectedDate(newDate);
        setSelectedHours([]);
        setHoursToCancel([]);
    };

    /**
     * Обрабатывает изменение месяца в календаре.
     * Обновляет viewDate для загрузки данных нового месяца и сбрасывает выбор.
     *
     * @param {Moment} newMonth - Первый день нового месяца.
     */
    const onMonthChange = (newMonth: Moment) => {
        setViewDate(newMonth); // Обновляем состояние viewDate для вызова API в хуке
        setSelectedDate(newMonth); // Опционально выбираем первый день нового месяца
        setSelectedHours([]);
        setHoursToCancel([]);
    };

    /**
     * Обрабатывает клики по отдельным часовым слотам.
     * Переключает выбор для бронирования или отмены в зависимости от текущего состояния и прав пользователя.
     *
     * @param {string} hour - Строка часа (например, "14:00").
     */
    const handleHourClick = (hour: string) => {
        // Если пользователь гость, он не может взаимодействовать со слотами
        if (isGuest) {
            return;
        }

        // Проверяем, является ли кликнутый час одним из уже забронированных
        const isBooked = bookedHours.some(b => b.hour === hour);
        const booking = bookedHours.find(b => b.hour === hour);
        const isMyBooking = booking?.userId === user?._id;
        console.log('booking', booking);

        if (isBooked) {
            if (isMyBooking || isAdmin) {
                // Переключаем часы для отмены
                setHoursToCancel(prev =>
                    prev.includes(hour) ? prev.filter(h => h !== hour) : [...prev, hour]
                );
                setSelectedHours([]); // Очищаем часы для бронирования
            }
        } else {
            // Переключаем часы для нового бронирования
            setSelectedHours(prev =>
                prev.includes(hour) ? prev.filter(h => h !== hour) : [...prev, hour]
            );
            setHoursToCancel([]); // Очищаем часы для отмены
        }
    };

    /**
     * Отправляет запрос на бронирование выбранных часов.
     * Вызывает APIPostBookRehearsal и обновляет данные в случае успеха.
     */
    const handleBooking = async () => {
        if (isGuest) return; // Защита от вызова гостем

        try {
            const response = await APIPostBookRehearsal(moment(selectedDate).format('DD/MM/YYYY'), selectedHours, user?.username, user?._id, 'band_name');
            if (!response.ok) {
                // Обработка ответа не-ОК, например, показать сообщение об ошибке
                throw new Error('Не удалось забронировать время.');
            }
            setSelectedHours([]); // Очищаем выбранные часы при успехе
            await fetchBookedHours(selectedDate as Moment); // Повторно загружаем забронированные часы для текущей даты
            refetch();
            // Опционально, показать сообщение об успехе пользователю
        } catch (error) {
            console.error('Booking failed:', error);
            // Обработка ошибки, например, показать всплывающее уведомление или обновить состояние ошибки
        }
    };

    /**
     * Отправляет запрос на отмену выбранных часов.
     * Вызывает APICancelBooking и обновляет данные в случае успеха.
     */
    const handleCancel = async () => {
        if (isGuest) return; // Защита от вызова гостем

        try {
            // userId должен быть строкой для соответствия ожиданиям бэкенда и определению типа
            await APICancelBooking(moment(selectedDate).format('DD/MM/YYYY'), hoursToCancel, user?._id, user?.username);
            // Обновляем состояние после успешной отмены
            setHoursToCancel([]); // Очищаем часы для отмены
            await fetchBookedHours(selectedDate as Moment); // Повторно загружаем забронированные часы для текущей даты
            // Опционально, показать сообщение об успехе пользователю
            refetch();
        } catch (error) {
            console.error('Cancellation failed:', error);
            // Обработка ошибки, например, показать всплывающее уведомление
        }
    };

    if (loading) {
        return <Loader />;
    }

    const isSelectedDayBeforeToday = moment(selectedDate).startOf('day').isBefore(moment().startOf('day'));
    const isBookingEnabled = selectedHours.length > 0 && !isGuest;
    const isBookingCancelling = hoursToCancel.length > 0 && !isGuest;

    const handleRequestAccess = async () => {
        try {
            await register();
            alert('Запрос на доступ отправлен администратору.');
        } catch (error) {
            console.error('Request access failed:', error);
            alert('Не удалось отправить запрос.');
        }
    };

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
                    hoursToCancel={hoursToCancel}
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
                {isUnregistered && (
                    <div className={css.bookingButtonContainer}>
                        <button
                            className={css.bookingButton}
                            onClick={handleRequestAccess}
                        >
                            Запросить доступ
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
