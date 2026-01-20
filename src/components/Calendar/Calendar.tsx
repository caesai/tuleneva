import React from "react";
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment';
import { PickersDay, type PickersDayProps } from '@mui/x-date-pickers/PickersDay';
import { Badge, Card } from "@mui/material";
import { ruRU } from "@mui/x-date-pickers/locales";
import moment, { type Moment } from '@/lib/moment';

/**
 * Свойства компонента Calendar.
 */
interface CalendarProps {
    /** Текущая выбранная дата. */
    date: Moment | null;
    /** Обработчик изменения выбранной даты. */
    onDateChange: (date: Moment | null) => void;
    /** Обработчик изменения месяца. */
    onMonthChange: (date: Moment) => void;
    /** Массив дней месяца (чисел), которые нужно подсветить (например, есть бронирования). */
    highlightedDates: number[];
}

/**
 * Компонент календаря для выбора даты.
 * Использует MUI X Date Pickers.
 * Отображает индикаторы на днях с бронированиями.
 *
 * @component
 */
export const Calendar: React.FC<CalendarProps> = ({ onDateChange, date, highlightedDates, onMonthChange }) => {
    return (
        <LocalizationProvider
            dateAdapter={AdapterMoment}
            dateLibInstance={moment}
            adapterLocale="ru"
            localeText={
                ruRU.components.MuiLocalizationProvider.defaultProps.localeText
            }
        >
            <Card>
                <DateCalendar
                    sx={{ height: 300 }}
                    onChange={onDateChange}
                    value={date}
                    slots={{ day: CalendarDay } as unknown as PickersDayProps['day']}
                    onMonthChange={onMonthChange}
                    slotProps={{
                        day: { highlightedDays: highlightedDates } as unknown as PickersDayProps,
                    }}
                />
            </Card>
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
