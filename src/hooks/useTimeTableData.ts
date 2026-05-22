// src/hooks/useTimeTableData.ts
import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { APIGetTimeTable, APIGetHours } from '@/api/timetable.api.ts';
import moment, { type Moment } from '@/lib/moment';
import type { IHour } from '@/types/timetable.types.ts';
import { useWebSocket, type WebSocketMessage } from './useWebSocket';
import { useAuth } from '@/hooks/useAuth.ts';

const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY = 1000;

export type FetchTimetableOptions = {
    /** Не включать полноэкранный loading / не дергать календарь (повторные попытки после ошибки). */
    silent?: boolean;
};

/**
 * Хук для управления данными расписания.
 * Загружает подсвеченные даты (дни с бронированиями) и забронированные часы для выбранной даты.
 * Поддерживает автоматические повторные попытки при ошибке загрузки.
 * Интегрирован с проверкой сетевого подключения и WebSocket для real-time обновлений.
 *
 * @param date - Просматриваемый месяц (Moment) или null.
 * @param selectedDate - Выбранный день для слотов (Moment) или null.
 * @param isOnline - Статус сетевого подключения (опционально, по умолчанию true).
 * @returns {object} Объект, содержащий:
 * - highlightedDates: массив чисел (дней месяца), где есть бронирования.
 * - bookedHours: массив объектов IHour с информацией о забронированных часах.
 * - loading: флаг загрузки.
 * - error: сообщение об ошибке или null.
 * - fetchBookedHours: функция для загрузки часов на конкретную дату.
 * - refetch: функция для повторной загрузки данных.
 * - isWebSocketConnected: статус WebSocket соединения.
 */
export const useTimeTableData = (
    date: Moment | null,
    selectedDate: Moment | null,
    isOnline: boolean = true,
) => {
    const [highlightedDates, setHighlightedDates] = useState<number[]>([]);
    const [bookedHours, setBookedHours] = useState<IHour[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [hoursLoading, setHoursLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const { capabilities } = useAuth();
    const { canViewUserDetails } = capabilities;
    const [retryCount, setRetryCount] = useState<number>(0);
    const retryCountRef = useRef(retryCount);
    retryCountRef.current = retryCount;
    const retryScheduleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Ref для отслеживания предыдущего статуса сети (для автоматического refetch)
    const wasOnlineRef = useRef<boolean>(isOnline);
    // Ref для хранения текущей даты (для refetch при восстановлении связи)
    const currentDateRef = useRef<Moment | null>(date);
    // Ref для хранения текущей выбранной даты (для сравнения в WebSocket callback)
    const selectedDateRef = useRef<string | null>(null);
    const selectedDateMomentRef = useRef<Moment | null>(selectedDate);
    const canViewUserDetailsRef = useRef(canViewUserDetails);
    const fetchBookedHoursRef = useRef<(targetDate: Moment) => Promise<void>>(async () => {});

    useEffect(() => {
        selectedDateMomentRef.current = selectedDate;
    }, [selectedDate]);

    useEffect(() => {
        canViewUserDetailsRef.current = canViewUserDetails;
    }, [canViewUserDetails]);

    /**
     * Callback для обработки WebSocket сообщений.
     * Обновляет bookedHours если дата совпадает с текущей выбранной.
     * Обновляет highlightedDates при изменении бронирований.
     */
    const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
        const { type, data } = message;
        
        if (type === 'booking_update' || type === 'booking_cancel') {
            const wsDate = data.date; // формат DD/MM/YYYY
            const currentSelectedDate = selectedDateRef.current;
            
            // WS отдаёт только публичные поля; участники подтягивают полный ответ через API
            if (currentSelectedDate === wsDate) {
                console.log('WebSocket: Updating booked hours for current date', wsDate);
                if (canViewUserDetailsRef.current && selectedDateMomentRef.current) {
                    void fetchBookedHoursRef.current(selectedDateMomentRef.current);
                } else {
                    setBookedHours(data.hours);
                }
            }
            
            // Обновляем highlightedDates
            const [d, m, y] = wsDate.split(/\D/);
            const updateDay = parseInt(d, 10);
            const updateMonth = parseInt(m, 10) - 1;
            const updateYear = parseInt(y, 10);
            
            // Проверяем, что обновление относится к текущему месяцу
            if (currentDateRef.current) {
                const currentMonth = currentDateRef.current.month();
                const currentYear = currentDateRef.current.year();
                
                if (updateMonth === currentMonth && updateYear === currentYear) {
                    setHighlightedDates(prev => {
                        if (data.hours.length > 0) {
                            // Добавляем день, если его нет
                            if (!prev.includes(updateDay)) {
                                console.log('WebSocket: Adding day to highlighted', updateDay);
                                return [...prev, updateDay].sort((a, b) => a - b);
                            }
                        } else {
                            // Убираем день, если броней больше нет
                            if (prev.includes(updateDay)) {
                                console.log('WebSocket: Removing day from highlighted', updateDay);
                                return prev.filter(d => d !== updateDay);
                            }
                        }
                        return prev;
                    });
                }
            }
        }
    }, []);

    useEffect(() => {
        return () => {
            if (retryScheduleRef.current) {
                clearTimeout(retryScheduleRef.current);
                retryScheduleRef.current = null;
            }
        };
    }, []);

    // WebSocket для real-time обновлений
    const { isConnected: isWebSocketConnected } = useWebSocket({
        onMessage: handleWebSocketMessage,
        autoReconnect: true,
        reconnectInterval: 3000,
        maxReconnectAttempts: 10
    });

    // Обновляем ref при изменении даты
    useEffect(() => {
        currentDateRef.current = date;
    }, [date]);

    const viewMonthKey = date?.format('YYYY-MM') ?? '';
    const selectedDateKey = selectedDate?.format('DD/MM/YYYY') ?? '';

    // Смена месяца: сброс попыток и отмена отложенного retry (иначе счётчик «ехал» бы на старый месяц)
    useEffect(() => {
        if (retryScheduleRef.current) {
            clearTimeout(retryScheduleRef.current);
            retryScheduleRef.current = null;
        }
        setRetryCount(0);
        setError(null);
    }, [viewMonthKey]);

    /** До paint: лоадер месяца и без старых подсветок в календаре */
    useLayoutEffect(() => {
        if (!viewMonthKey) return;
        setLoading(true);
        setHighlightedDates([]);
    }, [viewMonthKey]);

    /** До paint: лоадер дня и без старых слотов */
    useLayoutEffect(() => {
        if (!selectedDateKey) return;
        setHoursLoading(true);
        setBookedHours([]);
    }, [selectedDateKey]);

    // Основная функция загрузки данных (стабильная ссылка — без лишних эффектов при retry)
    const fetchData = useCallback(async (targetDate: Moment, options: FetchTimetableOptions = {}) => {
        const silent = options.silent === true;

        // Не выполняем запрос, если нет подключения
        if (!navigator.onLine) {
            setError('Нет подключения к интернету');
            if (!silent) setLoading(false);
            return;
        }

        if (!silent) {
            setLoading(true);
            setError(null);
        }

        try {
            const response = await APIGetTimeTable(moment(targetDate).format('DD/MM/YYYY'));
            if (!response.ok) {
                throw new Error('Не получилось загрузить расписание. Попробуйте еще раз.');
            }
            const data = await response.json();

            if (data && data.result) {
                const datesToHighlight = data.result.map((val: string) => {
                    const [d, m, y] = val.split(/\D/);
                    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                    return dateObj.getDate();
                });
                setHighlightedDates(datesToHighlight);
            } else {
                setHighlightedDates([]);
            }
            setRetryCount(0);
            setError(null);
        } catch (err) {
            console.error(err);
            const rc = retryCountRef.current;
            // Проверяем сеть перед retry
            if (!navigator.onLine) {
                setError('Нет подключения к интернету');
            } else if (rc < MAX_RETRIES) {
                const delay = INITIAL_RETRY_DELAY * Math.pow(2, rc);
                if (retryScheduleRef.current) clearTimeout(retryScheduleRef.current);
                retryScheduleRef.current = setTimeout(() => {
                    retryScheduleRef.current = null;
                    setRetryCount(prev => prev + 1);
                }, delay);
            } else {
                setError('Не удалось загрузить расписание. Проверьте подключение.');
            }
        } finally {
            if (!silent) {
                setLoading(false);
            }
        }
    }, []);

    /**
     * Загружает забронированные часы для выбранного дня.
     * @param targetDate - Дата (Moment)
     */
    const fetchBookedHours = useCallback(async (targetDate: Moment) => {
        if (!navigator.onLine) {
            setError('Нет подключения к интернету');
            return;
        }
        setHoursLoading(true);
        try {
            const formattedDate = targetDate.format('DD/MM/YYYY');
            selectedDateRef.current = formattedDate;

            const response = await APIGetHours(formattedDate);
            if (!response.ok) {
                throw new Error('Не получилось загрузить забронированное время.');
            }
            const data = await response.json();
            setBookedHours(data.hours);
            setError(null);
        } catch (err) {
            console.error(err);
            if (!navigator.onLine) {
                setError('Нет подключения к интернету');
            } else {
                setError('Не получилось загрузить забронированное время.');
            }
            setBookedHours([]);
        } finally {
            setHoursLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchBookedHoursRef.current = fetchBookedHours;
    }, [fetchBookedHours]);

    // Эффект для загрузки данных при изменении даты или retry
    useEffect(() => {
        if (!date) return;

        if (!isOnline && retryCount > 0) return;

        fetchData(date, { silent: retryCount > 0 });
    }, [date, retryCount, isOnline, fetchData]);

    // Загрузка слотов выбранного дня (ключ даты — без лишних запросов при новом объекте Moment)
    useEffect(() => {
        if (!selectedDate || !selectedDateKey) return;
        fetchBookedHours(selectedDate);
    }, [selectedDateKey, selectedDate, fetchBookedHours]);

    // Эффект для автоматического refetch при восстановлении связи
    useEffect(() => {
        if (!wasOnlineRef.current && isOnline && currentDateRef.current) {
            setRetryCount(0);
            fetchData(currentDateRef.current, { silent: false });
        }
        wasOnlineRef.current = isOnline;
    }, [isOnline, fetchData]);

    // Function to manually trigger a refetch
    const refetch = useCallback(() => {
        if (!currentDateRef.current) return;
        
        // Проверяем подключение перед refetch
        if (!navigator.onLine) {
            setError('Нет подключения к интернету');
            return;
        }
        
        setRetryCount(0);
        setError(null);
        fetchData(currentDateRef.current, { silent: false });
    }, [fetchData]);

    return {
        highlightedDates,
        bookedHours,
        loading,
        hoursLoading,
        error,
        fetchBookedHours,
        refetch,
        isWebSocketConnected,
    };
};
