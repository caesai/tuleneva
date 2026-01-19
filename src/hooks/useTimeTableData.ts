// src/hooks/useTimeTableData.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { APIGetTimeTable, APIGetHours } from '@/api/timetable.api.ts';
import moment, { type Moment } from '@/lib/moment';
import type { IHour } from '@/types/timetable.types.ts';

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 3000;

/**
 * Хук для управления данными расписания.
 * Загружает подсвеченные даты (дни с бронированиями) и забронированные часы для выбранной даты.
 * Поддерживает автоматические повторные попытки при ошибке загрузки.
 * Интегрирован с проверкой сетевого подключения.
 *
 * @param date - Текущая выбранная дата (Moment объект) или null.
 * @param isOnline - Статус сетевого подключения (опционально, по умолчанию true).
 * @returns {object} Объект, содержащий:
 * - highlightedDates: массив чисел (дней месяца), где есть бронирования.
 * - bookedHours: массив объектов IHour с информацией о забронированных часах.
 * - loading: флаг загрузки.
 * - error: сообщение об ошибке или null.
 * - fetchBookedHours: функция для загрузки часов на конкретную дату.
 * - refetch: функция для повторной загрузки данных.
 */
export const useTimeTableData = (date: Moment | null, isOnline: boolean = true) => {
    const [highlightedDates, setHighlightedDates] = useState<number[]>([]);
    const [bookedHours, setBookedHours] = useState<IHour[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [hoursLoading, setHoursLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState<number>(0);
    
    // Ref для отслеживания предыдущего статуса сети (для автоматического refetch)
    const wasOnlineRef = useRef<boolean>(isOnline);
    // Ref для хранения текущей даты (для refetch при восстановлении связи)
    const currentDateRef = useRef<Moment | null>(date);

    // Обновляем ref при изменении даты
    useEffect(() => {
        currentDateRef.current = date;
    }, [date]);

    // Основная функция загрузки данных
    const fetchData = useCallback(async (targetDate: Moment) => {
        // Не выполняем запрос, если нет подключения
        if (!navigator.onLine) {
            setError('Нет подключения к интернету');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

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
            // Проверяем сеть перед retry
            if (!navigator.onLine) {
                setError('Нет подключения к интернету');
            } else if (retryCount < MAX_RETRIES) {
                const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
                setTimeout(() => setRetryCount(prevCount => prevCount + 1), delay);
            } else {
                setError('Не удалось загрузить расписание. Проверьте подключение.');
            }
        } finally {
            setTimeout(() => setLoading(false), 500);
        }
    }, [retryCount]);

    // Эффект для загрузки данных при изменении даты или retry
    useEffect(() => {
        if (!date) return;
        
        // Не запускаем, если офлайн (кроме первого рендера для показа ошибки)
        if (!isOnline && retryCount > 0) return;
        
        fetchData(date);
    }, [date, retryCount, isOnline, fetchData]);

    // Эффект для автоматического refetch при восстановлении связи
    useEffect(() => {
        // Если были офлайн и теперь онлайн - обновляем данные
        if (!wasOnlineRef.current && isOnline && currentDateRef.current) {
            setRetryCount(0);
            fetchData(currentDateRef.current);
        }
        wasOnlineRef.current = isOnline;
    }, [isOnline, fetchData]);

    // Fetch booked hours for a specific date
    const fetchBookedHours = useCallback(async (targetDate: Moment) => {
        // Проверяем подключение перед запросом
        if (!navigator.onLine) {
            setError('Нет подключения к интернету');
            return;
        }
        setHoursLoading(true);
        try {
            const formattedDate = targetDate.format('DD/MM/YYYY');
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
            setTimeout(() => setHoursLoading(false), 500);
        }
    }, []);

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
        fetchData(currentDateRef.current);
    }, [fetchData]);

    return {
        highlightedDates,
        bookedHours,
        loading,
        hoursLoading,
        error,
        fetchBookedHours,
        refetch,
    };
};
