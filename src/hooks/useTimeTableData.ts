// src/hooks/useTimeTableData.ts
import { useState, useEffect, useCallback } from 'react';
import { APIPostTimeTable, APIPostBookedHours } from '@/api/timetable.api.ts';
import moment, { type Moment } from 'moment/moment';

export const useTimeTableData = (date: Moment | null) => {
    const [highlightedDates, setHighlightedDates] = useState<number[]>([]);
    const [bookedHours, setBookedHours] = useState<string[]>([]); // New state for booked hours
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch dates to be highlighted (runs once on mount)
    useEffect(() => {
        const fetchHighlightedDates = async () => {
            if (!date) return;
            try {
                setLoading(true);
                const response = await APIPostTimeTable(moment(date).format('DD/MM/YYYY'));
                if (!response.ok) {
                    throw new Error('Failed to fetch timetable data');
                }
                const data = await response.json();
                if (data.result) {
                    const datesToHighlight = data.result.map((d: string) => {
                        const dateObj = new Date(d);
                        return dateObj.getDate();
                    });
                    setHighlightedDates(datesToHighlight);
                } else {
                    setHighlightedDates([]);
                }
            } catch (err) {
                console.error(err);
                setError('Error loading timetable data.');
            } finally {
                setLoading(false);
            }
        };
        fetchHighlightedDates().then();
    }, [date]);

    // Fetch booked hours for a specific date
    const fetchBookedHours = useCallback(async (date: Moment) => {
        try {
            const formattedDate = date.format('DD/MM/YYYY');
            const response = await APIPostBookedHours(formattedDate);
            if (!response.ok) {
                throw new Error('Failed to fetch booked hours');
            }
            const data = await response.json();
            // Assuming the API returns an array of hour strings (e.g., ['15:00', '16:00'])
            setBookedHours(data.result);
            setBookedHours([]); // Clear booked hours on error
        } catch (err) {
            console.error(err);
            // Handle booked hours error state
            setBookedHours([]); // Clear booked hours on error
        }
    }, []);

    return {
        highlightedDates,
        bookedHours,
        loading,
        error,
        fetchBookedHours,
    };
};
