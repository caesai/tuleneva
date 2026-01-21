import css from '@/components/Schedule/Schedule.module.css';
import type { IHour, TRehearsalType } from '@/types/timetable.types';
import { RehearsalCard } from '@/components/RehearsalCard/RehearsalCard.tsx';
import type { JSX } from 'react';

interface IScheduleProps {
    bookedHours: IHour[];
}

interface MergedSlot {
    startHour: string;
    endHour: string;
    userId: string;
    username: string;
    band_name: string;
    userPhotoUrl: string;
    rehearsalType: TRehearsalType;
}

/**
 * Вычисляет конечное время (начальный час + 1)
 * Например: "23:00" -> "00:00", "12:00" -> "13:00"
 */
const calculateEndTime = (hour: string): string => {
    try {
        const hourNum = parseInt(hour.split(':')[0], 10);
        const nextHour = (hourNum + 1) % 24;
        return `${nextHour.toString().padStart(2, '0')}:00`;
    } catch (err) {
        console.error(err);
        return '';
    }

};

/**
 * Извлекает числовое значение часа из строки "HH:00"
 */
const getHourNumber = (hour: string): number => {
    return parseInt(hour.split(':')[0], 10);
};

/**
 * Генерирует массив всех часов от startHour до endHour (не включая endHour)
 * Например: ("18:00", "22:00") -> ["18:00", "19:00", "20:00", "21:00"]
 */
const generateHoursInRange = (startHour: string, endHour: string): string[] => {
    const hours: string[] = [];
    let currentHour = getHourNumber(startHour);
    const endHourNum = getHourNumber(endHour);

    while (currentHour !== endHourNum) {
        hours.push(`${currentHour.toString().padStart(2, '0')}:00`);
        currentHour = (currentHour + 1) % 24;
    }

    return hours;
};

/**
 * Группирует последовательные временные слоты одного пользователя/группы
 */
const mergeConsecutiveSlots = (bookedHours: IHour[]): MergedSlot[] => {
    if (bookedHours.length === 0) return [];

    // Сортируем по времени
    const sortedHours = [...bookedHours].sort((a, b) =>
        getHourNumber(a.hour) - getHourNumber(b.hour)
    );

    const mergedSlots: MergedSlot[] = [];
    let currentGroup: IHour[] = [sortedHours[0]];

    for (let i = 1; i < sortedHours.length; i++) {
        const current = sortedHours[i];
        const previous = sortedHours[i - 1];

        const currentHourNum = getHourNumber(current.hour);
        const previousHourNum = getHourNumber(previous.hour);

        // Проверяем, являются ли слоты последовательными и принадлежат одному пользователю/группе
        const isConsecutive = currentHourNum === previousHourNum + 1;
        const isSameUser = current.userId === previous.userId;
        const isSameBand = current.band_name === previous.band_name;

        if (isConsecutive && isSameUser && isSameBand) {
            // Добавляем к текущей группе
            currentGroup.push(current);
        } else {
            // Завершаем текущую группу и начинаем новую
            const firstSlot = currentGroup[0];
            const lastSlot = currentGroup[currentGroup.length - 1];
            mergedSlots.push({
                startHour: firstSlot.hour,
                endHour: calculateEndTime(lastSlot.hour),
                userId: firstSlot.userId,
                username: firstSlot.username,
                band_name: firstSlot.band_name,
                userPhotoUrl: firstSlot.userPhotoUrl,
                rehearsalType: firstSlot.rehearsalType,
            });
            currentGroup = [current];
        }
    }

    // Добавляем последнюю группу
    if (currentGroup.length > 0) {
        const firstSlot = currentGroup[0];
        const lastSlot = currentGroup[currentGroup.length - 1];
        mergedSlots.push({
            startHour: firstSlot.hour,
            endHour: calculateEndTime(lastSlot.hour),
            userId: firstSlot.userId,
            username: firstSlot.username,
            band_name: firstSlot.band_name,
            userPhotoUrl: firstSlot.userPhotoUrl,
            rehearsalType: firstSlot.rehearsalType,
        });
    }

    return mergedSlots;
};

/**
 * Компонент расписания
 * @param bookedHours - массив забронированных часов
 * @returns JSX.Element - компонент расписания
 */
export const Schedule: React.FC<IScheduleProps> = ({ bookedHours }): JSX.Element => {
    const mergedSlots: MergedSlot[] = mergeConsecutiveSlots(bookedHours);
    console.log(mergedSlots)

    return (
        <div className={css.schedule}>
            {mergedSlots.map((slot, index) => (
                <RehearsalCard
                    key={`${slot.startHour}-${index}`}
                    photoUrl={slot.userPhotoUrl}
                    username={slot.username}
                    selectedHours={generateHoursInRange(slot.startHour, slot.endHour)}
                    bookingBandName={slot.band_name}
                    rehearsalType={slot.rehearsalType}
                />
            ))}
        </div>
    );
};