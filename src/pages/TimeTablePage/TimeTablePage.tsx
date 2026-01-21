// src/pages/TimeTablePage/TimeTablePage.tsx
import React, { useState, useEffect, type JSX } from 'react';
import { Loader } from '@/components/Loader/Loader.tsx';
import { Calendar } from '@/components/Calendar/Calendar.tsx';
import { TimeSlots } from '@/components/TimeSlots/TimeSlots.tsx';
import { useTimeTableData } from '@/hooks/useTimeTableData.ts';
import moment, { type Moment } from '@/lib/moment';
import css from '@/pages/TimeTablePage/TimeTable.module.css';
import { APICancelBooking, APIPostBookRehearsal } from '@/api/timetable.api.ts';
import { useAuth } from '@/hooks/useAuth.ts';
import { useNetwork } from '@/contexts/NetworkContext.tsx';
import { ToastContainer } from '@/components/Toast/Toast.tsx';
import { useToast } from '@/hooks/useToast.ts';
import { Avatar, Tab } from '@mui/material';
import logo from '/logo_main512.svg';
import { useNavigate } from 'react-router-dom';
import { Schedule } from '@/components/Schedule/Schedule';
import TabPanel from '@mui/lab/TabPanel';
import TabContext from '@mui/lab/TabContext';
import { TabList } from '@mui/lab';
import { BookModalPopup } from '@/components/BookModalPopup/BookModalPopup';
import type { TRehearsalType } from '@/types/timetable.types';


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
 * @returns {JSX.Element} Отрисованный компонент TimeTablePage.
 */
export const TimeTablePage: React.FC = (): JSX.Element => {
    const navigate = useNavigate();
    // Состояние для текущей выбранной даты в календаре
    const [selectedDate, setSelectedDate] = useState<Moment | null>(moment());
    // Состояние для текущего просматриваемого месяца (влияет на загружаемые данные)
    const [viewDate, setViewDate] = useState<Moment | null>(moment());
    // Состояние для часов, выбранных для бронирования
    const [selectedHours, setSelectedHours] = useState<string[]>([]);
    // Состояние для часов, выбранных для отмены
    const [hoursToCancel, setHoursToCancel] = useState<string[]>([]);
    // Хук для отслеживания сетевого подключения
    const { isOnline } = useNetwork();
    // Хук для toast-уведомлений
    const { toasts, showToast, removeToast } = useToast();
    // Пользовательский хук для получения данных расписания (подсвеченные даты, забронированные часы)
    const { highlightedDates, bookedHours, loading, hoursLoading, error, fetchBookedHours, refetch } = useTimeTableData(viewDate, isOnline);
    // Состояние видимости модального окна подтверждения бронирования
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    // Состояние для поля "Имя пользователя" в форме бронирования
    // const [bookingUsername, setBookingUsername] = useState('');
    // Состояние для поля "Название коллектива" в форме бронирования
    const [bookingBandName, setBookingBandName] = useState('');
    const [isScheduleMode, setIsScheduleMode] = useState(false);
    const [rehearsalType, setRehearsalType] = useState<TRehearsalType>('rehearsal');

    useEffect(() => {
        // Обновляем режим отображения при изменении забронированных часов
        // Только когда загрузка завершена (hoursLoading = false)
        if (hoursLoading) return;
        setIsScheduleMode(bookedHours.length > 0);
    }, [bookedHours, hoursLoading]);

    const openBookingModal = () => {
        // setBookingUsername(user?.username || '');
        setBookingBandName('');
        setIsBookingModalOpen(true);
    };
    const closeBookingModal = () => setIsBookingModalOpen(false);

    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const isGuest = user?.role === 'guest';

    // Получаем сохранённые настройки пользователя (история названий групп)
    const localUserSettings = localStorage.getItem('userSettings');
    const userSettings = localUserSettings ? JSON.parse(localUserSettings) : {};
    const bandNames: string[] = userSettings.bandNames || [];

    // Загрузка забронированных часов для изначально выбранной даты (сегодня) при монтировании или изменении selectedDate
    useEffect(() => {
        if (selectedDate) {
            fetchBookedHours(selectedDate).then();
        }
    }, [selectedDate, fetchBookedHours]);



    // Показать toast при ошибке загрузки данных
    useEffect(() => {
        if (error) {
            showToast(error, 'error');
        }
    }, [error, showToast]);

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

        // Проверка сетевого подключения перед запросом
        if (!isOnline) {
            showToast('Нет подключения к интернету. Попробуйте позже.', 'error');
            return;
        }

        try {
            const response = await APIPostBookRehearsal(
                moment(selectedDate).format('DD/MM/YYYY'),
                selectedHours,
                bookingBandName,
                rehearsalType
            );
            if (!response.ok) {
                throw new Error('Не удалось забронировать время.');
            }
            // Сохраняем название группы в историю при успешном бронировании
            if (bookingBandName && !bandNames.includes(bookingBandName)) {
                const updatedSettings = { ...userSettings, bandNames: [...bandNames, bookingBandName] };
                localStorage.setItem('userSettings', JSON.stringify(updatedSettings));
            }
            setSelectedHours([]); // Очищаем выбранные часы при успехе
            await fetchBookedHours(selectedDate as Moment); // Повторно загружаем забронированные часы для текущей даты
            refetch();
            closeBookingModal();
            showToast('Время успешно забронировано!', 'success');
        } catch (err) {
            console.error('Booking failed:', err);
            showToast('Не удалось забронировать время.', 'error');
        }
    };

    /**
     * Отправляет запрос на отмену выбранных часов.
     * Вызывает APICancelBooking и обновляет данные в случае успеха.
     */
    const handleCancel = async () => {
        if (isGuest) return; // Защита от вызова гостем

        // Проверка сетевого подключения перед запросом
        if (!isOnline) {
            showToast('Нет подключения к интернету. Попробуйте позже.', 'error');
            return;
        }

        try {
            await APICancelBooking(moment(selectedDate).format('DD/MM/YYYY'), hoursToCancel);
            // Обновляем состояние после успешной отмены
            setHoursToCancel([]); // Очищаем часы для отмены
            await fetchBookedHours(selectedDate as Moment); // Повторно загружаем забронированные часы для текущей даты
            refetch();
            showToast('Бронирование отменено.', 'success');
        } catch (err) {
            console.error('Cancellation failed:', err);
            showToast('Не удалось отменить бронирование.', 'error');
        }
    };

    if (loading) {
        return <Loader />;
    }

    const isSelectedDayBeforeToday = moment(selectedDate).startOf('day').isBefore(moment().startOf('day'));
    const isBookingEnabled = selectedHours.length > 0 && !isGuest;
    const isBookingCancelling = hoursToCancel.length > 0 && !isGuest;

    const handleScheduleModeChange = () => {
        setIsScheduleMode(prev => !prev);
    };
    return (
        <div className={css.timetable}>
            {/* Toast-уведомления */}
            <ToastContainer toasts={toasts} onRemove={removeToast} />

            <BookModalPopup
                isOpen={isBookingModalOpen}
                onClose={closeBookingModal}
                selectedDate={selectedDate as Moment}
                selectedHours={selectedHours}
                bookingBandName={bookingBandName}
                bandNames={bandNames}
                onBookingBandNameChange={setBookingBandName}
                onBookingConfirm={handleBooking}
                onBookingCancel={closeBookingModal}
                username={user?.username || ''}
                photoUrl={user?.photo_url || ''}
                rehearsalType={rehearsalType}
                onRehearsalTypeChange={setRehearsalType}
            />

            <div className={css.card}>
                <div className={css.cardHeader}>
                    <Avatar src={user?.photo_url} />
                    <h2 className={css.title}>Расписание студии</h2>
                    <button className={css.logoButton} disabled={!isAdmin} onClick={() => navigate('/admin')}>
                        <img src={logo} alt="logo" className={css.logo} />
                    </button>
                </div>
                <Calendar
                    onDateChange={onDateChange}
                    onMonthChange={onMonthChange}
                    date={selectedDate}
                    highlightedDates={highlightedDates}
                />
                <TabContext value={isScheduleMode ? 'schedule' : 'booking'}>
                    {bookedHours.length > 0 && !hoursLoading && !isGuest &&
                        <TabList onChange={handleScheduleModeChange} variant="fullWidth">
                            <Tab label={selectedDate?.format('DD.MM.YYYY')} value="schedule" />
                            {!isGuest && <Tab label="Бронирование" value="booking" />}
                        </TabList>
                    }

                    <div className={css.tabWrapper}>
                        {hoursLoading && (
                            <div className={css.tabLoader}>
                                <img src={logo} alt="Загрузка..." className={css.tabLoaderSpinner} />
                            </div>
                        )}
                        <div className={css.tabContent} style={{ opacity: hoursLoading ? 0 : 1 }}>
                            <TabPanel value="schedule" style={{ padding: '20px 0' }}>
                                <Schedule bookedHours={bookedHours} />
                            </TabPanel>
                            <TabPanel value="booking" style={{ padding: '20px 0' }}>
                                {isGuest || isSelectedDayBeforeToday ? (
                                    <div className={css.noRehearsals}>Репетиций нет</div>
                                ) : (
                                    <TimeSlots
                                        bookedHours={bookedHours}
                                        selectedHours={selectedHours}
                                        hoursToCancel={hoursToCancel}
                                        onHourClick={handleHourClick}
                                        currentUserId={String(user?._id)}
                                        isAdmin={isAdmin}
                                        isSelectedDayBeforeToday={isSelectedDayBeforeToday}
                                    />)}
                            </TabPanel>

                        </div>
                    </div>
                </TabContext>
                {isBookingEnabled && (
                    <div className={css.bookingButtonContainer}>
                        <button
                            className={css.confirmButton}
                            onClick={openBookingModal}
                        >
                            Забронировать
                        </button>
                    </div>
                )}
                {isBookingCancelling && (
                    <div className={css.bookingButtonContainer}>
                        <button
                            className={css.cancelButton}
                            onClick={handleCancel}
                        >
                            Отменить
                        </button>
                    </div>
                )}

            </div>
        </div >
    );
};
