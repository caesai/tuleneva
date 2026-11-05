import React from 'react';
import { Calendar } from '@/components/Calendar/Calendar.tsx';
import type { Moment } from '@/lib/moment';

/**
 * Свойства блока календаря на странице расписания.
 */
export interface ITimeTableCalendarBlockProps {
    date: Moment | null;
    highlightedDates: number[];
    onDateChange: (date: Moment | null) => void;
    onMonthChange: (date: Moment) => void;
}

/**
 * Календарь выбора даты (MUI X Date Pickers) — отдельный async-чанк.
 */
export const TimeTableCalendarBlock: React.FC<ITimeTableCalendarBlockProps> = (props) => (
    <Calendar {...props} />
);
