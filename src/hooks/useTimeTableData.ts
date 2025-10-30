// src/hooks/useTimeTableData.ts
import { useState, useEffect, useCallback } from 'react';
import { APIGetTimeTable, APIGetHours } from '@/api/timetable.api.ts';
import moment, { type Moment } from 'moment/moment';
import type { IHour } from '@/types/timetable.types.ts';

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 3000;

export const useTimeTableData = (date: Moment | null) => {
    const [highlightedDates, setHighlightedDates] = useState<number[]>([]);
    const [bookedHours, setBookedHours] = useState<IHour[]>([]); // New state for booked hours
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState<number>(0);

    // Single useEffect for fetching dates with retry logic
    useEffect(() => {
        if (!date) return;

        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await APIGetTimeTable(moment(date).format('DD/MM/YYYY'));
                if (!response.ok) {
                    throw new Error('Не получилось загрузить расписание. Попробуйте еще раз.');
                }
                const data = await response.json();

                if (data && data.result) {
                    const datesToHighlight = data.result.map((val: string) => {
                        let [d, m, y] = val.split(/\D/);
                        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                        return dateObj.getDate();
                    });
                    setHighlightedDates(datesToHighlight);
                } else {
                    setHighlightedDates([]);
                }
                setRetryCount(0); // Reset retry count on success
            } catch (err) {
                console.error(err);
                if (retryCount < MAX_RETRIES) {
                    const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
                    setTimeout(() => setRetryCount(prevCount => prevCount + 1), delay);
                } else {
                    setError('Не удалось загрузить расписание после нескольких попыток. Проверьте подключение.');
                }
            } finally {
                setLoading(false);
            }
        };

        fetchData().then();
    }, [date, retryCount]); // Now `date` and `retryCount` are the sole dependencies


    // Fetch booked hours for a specific date
    const fetchBookedHours = useCallback(async (date: Moment) => {
        try {
            const formattedDate = date.format('DD/MM/YYYY');
            const response = await APIGetHours(formattedDate);
            if (!response.ok) {
                throw new Error('Не получилось загрузить забронированное время.');
            }
            const data = await response.json();
            setBookedHours(data.hours);
        } catch (err) {
            console.error(err);
            // Handle booked hours error state
            setError('Не получилось загрузить забронированное время.');
            setBookedHours([]); // Clear booked hours on error
        }
    }, []);

    // Function to manually trigger a refetch
    const refetch = () => {
        setLoading(true);
        setRetryCount(1); // Start the retry process again
        setError(null);
        setLoading(false);
    };

    return {
        highlightedDates,
        bookedHours,
        loading,
        error,
        fetchBookedHours,
        refetch,
    };
};
