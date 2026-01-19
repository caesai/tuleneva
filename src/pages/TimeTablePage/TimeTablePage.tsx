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
import { useNetwork } from '@/contexts/NetworkContext.tsx';
import { ToastContainer } from '@/components/Toast/Toast.tsx';
import { useToast } from '@/hooks/useToast.ts';
import { Autocomplete, Avatar, CardHeader, Tab, TextField } from '@mui/material';
import logo from '/logo_main512.svg';
import { useNavigate } from 'react-router-dom';
import { Schedule } from '@/components/Schedule/Schedule';
import TabPanel from '@mui/lab/TabPanel';
import TabContext from '@mui/lab/TabContext';
import { TabList } from '@mui/lab';
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

    useEffect(() => {
        if (!hoursLoading) return;
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
                bookingBandName
            );
            if (!response.ok) {
                throw new Error('Не удалось забронировать время.');
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

    const localUserSettings = localStorage.getItem('userSettings');
    const userSettings = localUserSettings ? JSON.parse(localUserSettings) : {};
    const bandNames = userSettings.bandNames || [];
    const bandNameOptions = bandNames.map((bandName: string) => ({ label: bandName, value: bandName }));
    const handleBandNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setBookingBandName(value);
        if (bandNames.includes(value)) {
            return;
        }
        userSettings.bandNames = [...bandNames, value];
        localStorage.setItem('userSettings', JSON.stringify(userSettings));
    };

    const handleScheduleModeChange = () => {
        setIsScheduleMode(prev => !prev);
    };
    return (
        <div className={css.timetable}>
            {/* Toast-уведомления */}
            <ToastContainer toasts={toasts} onRemove={removeToast} />

            <ModalPopup isOpen={isBookingModalOpen} onClose={closeBookingModal}>
                <div className={css.bookingModal}>
                    <h3 style={{ textAlign: 'left' }}>Репетиция</h3>
                    <CardHeader
                        style={{ textAlign: 'left' }}
                        avatar={
                            <Avatar src={user?.photo_url} />
                        }
                        title={`🕓: ${selectedHours.sort().join(', ')}`}
                        subheader={`📅: ${moment(selectedDate).format('DD.MM.YYYY')}`}
                    />

                    <div className={css.inputGroup}>
                        <Autocomplete
                            disablePortal
                            options={bandNameOptions}
                            sx={{ width: 300 }}
                            renderInput={(params) => <TextField {...params} label="Название коллектива (опционально)" onChange={handleBandNameChange} />}
                        />
                    </div>

                    <div className={css.modalButtons}>
                        <button className={css.confirmButton} onClick={handleBooking}>
                            Подтвердить
                        </button>
                        <button className={css.cancelButton} onClick={closeBookingModal}>
                            Отмена
                        </button>
                    </div>
                </div>
            </ModalPopup>

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
                <TabContext value={isScheduleMode ? 0 : 1}>
                    {bookedHours.length > 0 && !hoursLoading &&
                        <TabList onChange={handleScheduleModeChange} variant="fullWidth">
                            <Tab label={selectedDate?.format('DD.MM.YYYY')} value={0} />
                            <Tab label="Бронирование" value={1} />
                        </TabList>
                    }

                    <div className={css.tabWrapper}>
                        {hoursLoading && (
                            <div className={css.tabLoader}>
                                <img src={logo} alt="Загрузка..." className={css.tabLoaderSpinner} />
                            </div>
                        )}
                        <div className={css.tabContent} style={{ opacity: hoursLoading ? 0 : 1 }}>
                            <TabPanel value={0} style={{ padding: '20px 0' }}>
                                <Schedule bookedHours={bookedHours} />
                            </TabPanel>
                            <TabPanel value={1} style={{ padding: '20px 0' }}>
                                <TimeSlots
                                    bookedHours={bookedHours}
                                    selectedHours={selectedHours}
                                    hoursToCancel={hoursToCancel}
                                    onHourClick={handleHourClick}
                                    currentUserId={String(user?._id)}
                                    isAdmin={isAdmin}
                                    isSelectedDayBeforeToday={isSelectedDayBeforeToday}
                                />
                            </TabPanel>
                        </div>
                    </div>
                </TabContext>
                {isBookingEnabled && (
                    <div className={css.bookingButtonContainer}>
                        <button
                            className={css.bookingButton}
                            onClick={openBookingModal}
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
        </div >
    );
};
