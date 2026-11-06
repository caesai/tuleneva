// src/pages/TimeTablePage/TimeTablePage.tsx
import React, { useState, useEffect, Suspense, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader } from '@/components/Loader/Loader.tsx';
import { SuspenseLoaderFallback } from '@/components/Loader/SuspenseLoaderFallback.tsx';
import { useDelayedLoading } from '@/hooks/useDelayedLoading.ts';
import { useTimeTableData } from '@/hooks/useTimeTableData.ts';
import moment, { type Moment } from '@/lib/moment';
import css from '@/pages/TimeTablePage/TimeTable.module.css';
import { useAuth } from '@/hooks/useAuth.ts';
import { useNetwork } from '@/hooks/useNetwork.ts';
import { ToastContainer } from '@/components/Toast/Toast.tsx';
import { useToast } from '@/hooks/useToast.ts';
import { useTelegramStartInvite } from '@/auth/useInviteEntry.ts';
import {
    LazyBookModalPopup,
    LazyTimeTableCalendarBlock,
    LazyTimeTableDayTabs,
    preloadBookModalChunk,
    preloadTimeTableMuiChunks,
} from '@/pages/TimeTablePage/lazyMuiChunks.ts';
import { TimeTableEmailDialogs } from '@/components/TimeTableEmailDialogs/TimeTableEmailDialogs.tsx';
import { readSavedBandNames, useTimeTableBooking } from '@/hooks/useTimeTableBooking.ts';
import { useTimeTableEmailAuth } from '@/hooks/useTimeTableEmailAuth.ts';
import { studioTodayMoment } from '@/lib/studioToday.ts';
import type { TRehearsalType } from '@/types/timetable.types';
import { formatDdMmYyyyMoscow, isStudioDayBeforeToday } from '../../../shared/studioHours.ts';
import { APP_PAGE_META } from '@/config/siteMeta.ts';
import { usePageMeta } from '@/hooks/usePageMeta.ts';


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
 * - Привязка почты для входа в браузере открывается иконкой конверта рядом с админкой.
 *
 * @returns {JSX.Element} Отрисованный компонент TimeTablePage.
 */
export const TimeTablePage: React.FC = (): JSX.Element => {
    usePageMeta(APP_PAGE_META);

    const navigate = useNavigate();
    // Календарный день студии (Москва), а не «сегодня» в поясе браузера.
    const [selectedDate, setSelectedDate] = useState<Moment | null>(() => studioTodayMoment());
    // Месяц, для которого грузится подсветка. Та же точка отсчёта, что у выбранного дня.
    const [viewDate, setViewDate] = useState<Moment | null>(() => studioTodayMoment());
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
    /** После первого полного показа — слоты грузятся отдельным лоадером под календарём */
    const [initialLoadDone, setInitialLoadDone] = useState(false);

    const isMonthLoading = loading || showPageLoading || monthTransition;
    const isDayLoading = hoursLoading || showHoursLoading || dayTransition;

    useEffect(() => {
        if (
            initialLoadDone
            || loading
            || hoursLoading
            || showPageLoading
            || showHoursLoading
        ) {
            return;
        }
        setInitialLoadDone(true);
    }, [initialLoadDone, loading, hoursLoading, showPageLoading, showHoursLoading]);

    const showCardLoader = initialLoadDone ? isMonthLoading : (isMonthLoading || isDayLoading);
    const showTabsLoader = initialLoadDone && isDayLoading;
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

    const {
        user,
        capabilities,
        isAuthenticated,
        isLoading: authLoading,
        isInTelegram,
        telegramStartParam,
        registerWithInvite,
    } = useAuth();
    const { isAdmin, isGuest, canManageBookings, canViewUserDetails } = capabilities;
    const currentUserId = user?._id ? String(user._id) : '';
    const emailAuth = useTimeTableEmailAuth({
        user,
        isAuthenticated,
        isGuest,
        isAdmin,
        isInTelegram,
        authLoading,
        showToast,
    });

    /**
     * Mini App открывается на /app, а не на /. startapp из общей ссылки
     * нужно применить здесь, иначе человек не попадает в базу и остаётся без роли user.
     */
    useTelegramStartInvite({
        isInTelegram,
        authLoading,
        isAuthenticated,
        user,
        telegramStartParam,
        registerWithInvite,
        showToast,
    });

    const bandNames = readSavedBandNames();

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
        const isMyBooking = currentUserId !== '' && String(booking?.userId) === currentUserId;

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

    const { handleBooking, handleCancel } = useTimeTableBooking({
        canManageBookings,
        isOnline,
        selectedDate,
        selectedHours,
        hoursToCancel,
        bookingBandName,
        rehearsalType,
        bandNames,
        showToast,
        fetchBookedHours,
        refetch,
        closeBookingModal,
        setSelectedHours,
        setHoursToCancel,
    });

    const selectedDateDdMmYyyy = selectedDate
        ? moment(selectedDate).format('DD/MM/YYYY')
        : formatDdMmYyyyMoscow(new Date());
    const isSelectedDayBeforeToday = isStudioDayBeforeToday(selectedDateDdMmYyyy);
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

            <TimeTableEmailDialogs auth={emailAuth} />

            <nav className={css.studioNav} aria-label="Разделы студии">
                <Link to="/music">Музыка</Link>
            </nav>

            <div className={css.card}>
                {(emailAuth.showEmailLinkForm || isAdmin) && (
                    <div className={css.cardCornerActions}>
                        {emailAuth.showEmailLinkForm && (
                            <button
                                type="button"
                                className={css.adminEntryButton}
                                onClick={emailAuth.openEmailLink}
                                aria-label="Вход в браузере"
                                title="Вход в браузере"
                            >
                                <svg
                                    className={css.adminEntryIcon}
                                    viewBox="0 0 24 24"
                                    width="18"
                                    height="18"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <path
                                        fill="currentColor"
                                        d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5L4 8V6l8 5 8-5v2z"
                                    />
                                </svg>
                            </button>
                        )}
                        {isAdmin && (
                            <button
                                type="button"
                                className={css.adminEntryButton}
                                onClick={() => navigate('/admin')}
                                aria-label="Админ-панель"
                                title="Админ-панель"
                            >
                                <svg
                                    className={css.adminEntryIcon}
                                    viewBox="0 0 24 24"
                                    width="18"
                                    height="18"
                                    aria-hidden="true"
                                    focusable="false"
                                >
                                    <path
                                        fill="currentColor"
                                        d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"
                                    />
                                </svg>
                            </button>
                        )}
                    </div>
                )}
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
                                            className={`${css.suspenseLoader} ${css.suspenseLoaderTabs}`}
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
                                        currentUserId={currentUserId}
                                        isAdmin={isAdmin}
                                        isSelectedDayBeforeToday={isSelectedDayBeforeToday}
                                        selectedDateDdMmYyyy={selectedDateDdMmYyyy}
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
