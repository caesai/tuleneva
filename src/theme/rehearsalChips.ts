/**
 * @file Класс цветного чипа по типу слота.
 * Смысл цветов как у MUI Chip на main: репетиция — info, запись — error, съёмка — success.
 */
import type { TRehearsalType } from '@/types/timetable.types.ts';
import ui from '@/theme/ui.module.css';

/**
 * Мягкая заливка и цвет текста для типа брони.
 * @param type Тип слота
 * @returns Класс CSS-модуля
 */
export const rehearsalTypeChipClass = (type: TRehearsalType): string => {
    if (type === 'recording') {
        return ui.chipRecording;
    }
    if (type === 'shooting') {
        return ui.chipShooting;
    }
    return ui.chipRehearsal;
};
