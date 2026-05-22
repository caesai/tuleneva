import React from 'react';
import { Loader } from '@/components/Loader/Loader.tsx';
import { Tab } from '@mui/material';
import { TabList, TabContext, TabPanel } from '@mui/lab';
import { TimeSlots } from '@/components/TimeSlots/TimeSlots.tsx';
import { Schedule } from '@/components/Schedule/Schedule';
import type { IHour } from '@/types/timetable.types.ts';
import type { Moment } from '@/lib/moment';
import css from '@/pages/TimeTablePage/TimeTable.module.css';

/**
 * Свойства панели вкладок «расписание дня / бронирование» (MUI Lab).
 */
export interface ITimeTableDayTabsProps {
    activeTab: string;
    hasBookedHours: boolean;
    hoursLoading: boolean;
    /** Сглаженный показ оверлея лоадера (см. useDelayedLoading). */
    showHoursLoading: boolean;
    canManageSelectedDate: boolean;
    selectedDate: Moment | null;
    bookedHours: IHour[];
    selectedHours: string[];
    hoursToCancel: string[];
    readonlyMessage: string | null;
    canViewUserDetails: boolean;
    currentUserId: string;
    isAdmin: boolean;
    isSelectedDayBeforeToday: boolean;
    isToday: boolean;
    onScheduleModeChange: (_event: React.SyntheticEvent, value: string) => void;
    onHourClick: (hour: string) => void;
}

/**
 * Вкладки дня и слоты бронирования (MUI Lab + TimeSlots) — отдельный async-чанк.
 */
export const TimeTableDayTabs: React.FC<ITimeTableDayTabsProps> = ({
    activeTab,
    hasBookedHours,
    hoursLoading,
    showHoursLoading,
    canManageSelectedDate,
    selectedDate,
    bookedHours,
    selectedHours,
    hoursToCancel,
    readonlyMessage,
    canViewUserDetails,
    currentUserId,
    isAdmin,
    isSelectedDayBeforeToday,
    isToday,
    onScheduleModeChange,
    onHourClick,
}) => (
    <TabContext value={activeTab}>
        {hasBookedHours && !hoursLoading && canManageSelectedDate && (
            <TabList onChange={onScheduleModeChange} variant="fullWidth">
                <Tab label={selectedDate?.format('DD.MM.YYYY')} value="schedule" />
                <Tab label="Бронирование" value="booking" />
            </TabList>
        )}

        <div className={css.tabWrapper}>
            {showHoursLoading && (
                <div className={css.tabLoader} aria-busy="true" aria-label="Загрузка слотов">
                    <Loader fullScreen={false} />
                </div>
            )}
            <div
                className={css.tabContent}
                style={{ opacity: showHoursLoading ? 0 : 1 }}
            >
                <TabPanel value="schedule" style={{ padding: '20px 0' }}>
                    {hasBookedHours ? (
                        <Schedule
                            bookedHours={bookedHours}
                            canViewUserDetails={canViewUserDetails}
                        />
                    ) : (
                        <div className={css.noRehearsals}>{readonlyMessage}</div>
                    )}
                </TabPanel>
                {canManageSelectedDate && (
                    <TabPanel value="booking" style={{ padding: '20px 0' }}>
                        <TimeSlots
                            bookedHours={bookedHours}
                            selectedHours={selectedHours}
                            hoursToCancel={hoursToCancel}
                            onHourClick={onHourClick}
                            currentUserId={currentUserId}
                            isAdmin={isAdmin}
                            isSelectedDayBeforeToday={isSelectedDayBeforeToday}
                            isToday={isToday}
                        />
                    </TabPanel>
                )}
            </div>
        </div>
    </TabContext>
);
