import React from "react";
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment';
import { PickersDay, type PickersDayProps } from '@mui/x-date-pickers/PickersDay';
import { Badge } from "@mui/material";
import { ruRU } from "@mui/x-date-pickers/locales";
import type { Moment } from 'moment';
// import css from '@/components/Calendar/Calendar.module.css';
// import moment, { type Moment } from "moment";

interface CalendarProps {
    date: Moment | null;
    onDateChange: (date: Moment | null) => void;
    onMonthChange: (date: Moment) => void;
    highlightedDates: number[];
}

export const Calendar: React.FC<CalendarProps> = ({ onDateChange, date, highlightedDates, onMonthChange }) => {
    return (
        <LocalizationProvider
            dateAdapter={AdapterMoment}
            adapterLocale="ru"
            localeText={
                ruRU.components.MuiLocalizationProvider.defaultProps.localeText
            }
        >
            <DateCalendar
                onChange={onDateChange}
                value={date}
                slots={{ day: CalendarDay } as any}
                onMonthChange={onMonthChange}
                slotProps={{
                    day: { highlightedDays: highlightedDates } as any,
                }}
            />
        </LocalizationProvider>
    );
}

interface CalendarDayProps extends PickersDayProps {
    highlightedDays: number[];
}

const CalendarDay: React.FC<CalendarDayProps> = (props) => {
    const { highlightedDays = [], day, outsideCurrentMonth, ...other } = props;
    const isSelected = !outsideCurrentMonth && highlightedDays.indexOf(day.date()) >= 0;
    return (
        <Badge
            key={day.toString()}
            overlap="circular"
            badgeContent={isSelected ? "🎸" : undefined}
        >
            <PickersDay
                {...other}
                outsideCurrentMonth={outsideCurrentMonth}
                day={day}
            />
        </Badge>
    );
}
