// src/pages/TimeTablePage/TimeTablePage.tsx
import React, { useState, useEffect, Suspense, type JSX } from 'react';
import { Loader } from '@/components/Loader/Loader.tsx';
import { SuspenseLoaderFallback } from '@/components/Loader/SuspenseLoaderFallback.tsx';
import { useDelayedLoading } from '@/hooks/useDelayedLoading.ts';
import { useTimeTableData } from '@/hooks/useTimeTableData.ts';
import moment, { type Moment } from '@/lib/moment';
import css from '@/pages/TimeTablePage/TimeTable.module.css';
import { APICancelBooking, APIPostBookRehearsal } from '@/api/timetable.api.ts';
import { useAuth } from '@/hooks/useAuth.ts';
import { useNetwork } from '@/hooks/useNetwork.ts';
import { ToastContainer } from '@/components/Toast/Toast.tsx';
import { useToast } from '@/hooks/useToast.ts';
// import logo from '/logo_main512.svg';
// import { useNavigate } from 'react-router-dom';
import {
    LazyBookModalPopup,
    LazyTimeTableCalendarBlock,
    LazyTimeTableDayTabs,
    preloadBookModalChunk,
    preloadTimeTableMuiChunks,
} from '@/pages/TimeTablePage/lazyMuiChunks.ts';
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
    // const navigate = useNavigate();
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
    const { highlightedDates, bookedHours, loading, hoursLoading, error, fetchBookedHours, refetch } =
        useTimeTableData(viewDate, selectedDate, isOnline);
    /** Лоадер месяца: minVisibleMs после ответа API */
    const showPageLoading = useDelayedLoading(loading);
    const showHoursLoading = useDelayedLoading(hoursLoading);
    /** Синхронно с кликом — до useLayoutEffect в хуке */
    const [monthTransition, setMonthTransition] = useState(false);
    const [dayTransition, setDayTransition] = useState(false);
    const showCardLoader = loading || showPageLoading || monthTransition;
    const showTabsLoader = hoursLoading || showHoursLoading || dayTransition;
    // Состояние видимости модального окна подтверждения бронирования
    const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
    // Состояние для поля "Имя пользователя" в форме бронирования
    // const [bookingUsername, setBookingUsername] = useState('');
    // Состояние для поля "Название коллектива" в форме бронирования
    const [bookingBandName, setBookingBandName] = useState('');
    const [isScheduleMode, setIsScheduleMode] = useState(false);
    const [rehearsalType, setRehearsalType] = useState<TRehearsalType>('rehearsal');

    useEffect(() => {
        // После завершения загрузки слотов — один раз выставляем вкладку «расписание», если есть брони
        if (hoursLoading) return;
        setIsScheduleMode(bookedHours.length > 0);
    }, [bookedHours, hoursLoading]);

    useEffect(() => {
        preloadTimeTableMuiChunks();
    }, []);

    useEffect(() => {
        if (!loading && !showPageLoading) {
            setMonthTransition(false);
        }
    }, [loading, showPageLoading]);

    useEffect(() => {
        if (!hoursLoading && !showHoursLoading) {
            setDayTransition(false);
        }
    }, [hoursLoading, showHoursLoading]);

    useEffect(() => {
        if (isBookingModalOpen) {
            preloadBookModalChunk();
        }
    }, [isBookingModalOpen]);

    const openBookingModal = () => {
        preloadBookModalChunk();
        setBookingBandName('');
        setIsBookingModalOpen(true);
    };
    const closeBookingModal = () => setIsBookingModalOpen(false);

    const { user, capabilities } = useAuth();
    const { isAdmin, isGuest, canManageBookings, canViewUserDetails } = capabilities;

    // Получаем сохранённые настройки пользователя (история названий групп)
    const localUserSettings = localStorage.getItem('userSettings');
    const userSettings = localUserSettings ? JSON.parse(localUserSettings) : {};
    const bandNames: string[] = userSettings.bandNames || [];

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
        setDayTransition(true);
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
        setMonthTransition(true);
        setDayTransition(true);
        setViewDate(newMonth);
        setSelectedDate(newMonth);
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
        // Только подтвержденный авторизованный пользователь может выбирать слоты.
        if (!canManageBookings) {
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
        if (!canManageBookings) return; // Защита от вызова без прав на бронирование

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
        if (!canManageBookings) return; // Защита от вызова без прав на отмену

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

    const isSelectedDayBeforeToday = moment(selectedDate).startOf('day').isBefore(moment().startOf('day'));
    const isToday = moment(selectedDate).startOf('day').isSame(moment().startOf('day'));
    const hasBookedHours = bookedHours.length > 0;
    const canManageSelectedDate = canManageBookings && !isSelectedDayBeforeToday;
    const isBookingEnabled = selectedHours.length > 0 && canManageSelectedDate;
    const isBookingCancelling = hoursToCancel.length > 0 && canManageSelectedDate;
    const activeTab = canManageSelectedDate && !isScheduleMode ? 'booking' : 'schedule';

    const getReadonlyMessage = () => {
        if (hasBookedHours) return null;
        if (isSelectedDayBeforeToday) return 'На выбранную дату репетиций не было.';
        if (!capabilities.canManageBookings && !user) {
            return 'Бронирование доступно только авторизованным пользователям.';
        }
        if (isGuest) return 'Ваш аккаунт ожидает подтверждения администратора.';
        return 'Репетиций нет';
    };

    const handleScheduleModeChange = (_event: React.SyntheticEvent, value: string) => {
        setIsScheduleMode(value === 'schedule');
    };
    return (
        <div className={css.timetable}>
            {/* Toast-уведомления */}
            <ToastContainer toasts={toasts} onRemove={removeToast} />

            {canManageSelectedDate && isBookingModalOpen && (
                <Suspense fallback={null}>
                    <LazyBookModalPopup
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
                </Suspense>
            )}

            <div className={css.card}>
                {showCardLoader ? (
                    <div
                        className={`${css.cardLoader} ${css.cardLoaderFull}`}
                        aria-busy="true"
                        aria-label="Загрузка расписания"
                    >
                        <Loader fullScreen={false} />
                    </div>
                ) : (
                    <>
                        <Suspense
                            fallback={(
                                <SuspenseLoaderFallback
                                    fullScreen={false}
                                    className={css.suspenseLoader}
                                />
                            )}
                        >
                            <LazyTimeTableCalendarBlock
                                onDateChange={onDateChange}
                                onMonthChange={onMonthChange}
                                date={selectedDate}
                                highlightedDates={highlightedDates}
                            />
                        </Suspense>
                        {showTabsLoader ? (
                            <div
                                className={`${css.cardLoader} ${css.cardLoaderTabs}`}
                                aria-busy="true"
                                aria-label="Загрузка слотов"
                            >
                                <Loader fullScreen={false} />
                            </div>
                        ) : (
                            <>
                                <Suspense
                                    fallback={(
                                        <SuspenseLoaderFallback
                                            fullScreen={false}
                                            className={`${css.tabWrapper} ${css.suspenseLoader} ${css.suspenseLoaderTabs}`}
                                        />
                                    )}
                                >
                                    <LazyTimeTableDayTabs
                                        activeTab={activeTab}
                                        hasBookedHours={hasBookedHours}
                                        canManageSelectedDate={canManageSelectedDate}
                                        selectedDate={selectedDate}
                                        bookedHours={bookedHours}
                                        selectedHours={selectedHours}
                                        hoursToCancel={hoursToCancel}
                                        readonlyMessage={getReadonlyMessage()}
                                        canViewUserDetails={canViewUserDetails}
                                        currentUserId={String(user?._id)}
                                        isAdmin={isAdmin}
                                        isSelectedDayBeforeToday={isSelectedDayBeforeToday}
                                        isToday={isToday}
                                        onScheduleModeChange={handleScheduleModeChange}
                                        onHourClick={handleHourClick}
                                    />
                                </Suspense>
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
                            </>
                        )}
                    </>
                )}
            </div>
        </div >
    );
};
