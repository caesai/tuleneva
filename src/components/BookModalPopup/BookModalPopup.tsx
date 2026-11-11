import type { Moment } from "moment";
import React, { type JSX } from "react";
import { Autocomplete, TextField } from "@mui/material";
import { ModalPopup } from "@/components/ModalPopup/ModalPopup.tsx";
import { RehearsalCard } from "@/components/RehearsalCard/RehearsalCard.tsx";
import moment from "moment";
import css from "@/components/BookModalPopup/BookModalPopup.module.css";
import ui from "@/theme/ui.module.css";
import { rehearsalTypeChipClass } from "@/theme/rehearsalChips.ts";
import type { TRehearsalType } from "@/types/timetable.types.ts";

/**
 * Свойства компонента BookModalPopup
 * @param isOpen - флаг, отвечающий за открытие/закрытие модального окна
 * @param onClose - функция, вызываемая при закрытии модального окна
 * @param selectedDate - выбранная дата
 * @param selectedHours - выбранные часы
 * @param bookingBandName - название коллектива, забронированного на выбранные часы
 * @param bandNames - список доступных коллективов
 * @param onBookingBandNameChange - функция, вызываемая при изменении названия коллектива
 * @param onBookingConfirm - функция, вызываемая при подтверждении бронирования
 * @param onBookingCancel - функция, вызываемая при отмене бронирования
 * @param username - имя пользователя
 * @param photoUrl - URL фото пользователя
 * @param rehearsalType - тип репетиции
 * @param onRehearsalTypeChange - функция, вызываемая при изменении типа репетиции
 */
interface IBookModalPopupProps {
    isOpen: boolean;
    onClose: () => void;
    selectedDate: Moment;
    selectedHours: string[];
    bookingBandName: string;
    bandNames: string[];
    onBookingBandNameChange: (bandName: string) => void;
    onBookingConfirm: () => void;
    onBookingCancel: () => void;
    username: string;
    photoUrl: string;
    rehearsalType: TRehearsalType;
    onRehearsalTypeChange: (rehearsalType: TRehearsalType) => void;
}
/**
 * Преобразует первую букву строки в верхний регистр
 * @param string - строка, которую нужно преобразовать
 * @returns строка с первой буквой в верхнем регистре
 */
const capitalizeFirstLetter = (string: string) => {
    if (string.length === 0) { // Обработка пустых строк
        return "";
    }
    return string.charAt(0).toUpperCase() + string.slice(1);
}
/**
 * Компонент BookModalPopup
 * @param param0 
 * @returns JSX.Element
 */
export const BookModalPopup: React.FC<IBookModalPopupProps> = ({ isOpen, onClose, selectedDate, selectedHours, bookingBandName, bandNames, onBookingBandNameChange, onBookingConfirm, onBookingCancel, username, photoUrl, rehearsalType, onRehearsalTypeChange }): JSX.Element => {
    const title = `${capitalizeFirstLetter(moment(selectedDate).format('dddd'))} ${moment(selectedDate).format('DD.MM.YYYY')}`;
    return (
        <ModalPopup isOpen={isOpen} onClose={onClose} title={title}>
            <RehearsalCard
                photoUrl={photoUrl}
                username={username}
                selectedHours={selectedHours}
                bookingBandName={bookingBandName}
                rehearsalType={rehearsalType}
                canViewUserDetails
            />
            <RehearsalTypesSelector rehearsalType={rehearsalType} onRehearsalTypeChange={onRehearsalTypeChange} />
            <Autocomplete
                freeSolo
                disablePortal
                options={bandNames}
                inputValue={bookingBandName}
                onInputChange={(_event, newValue) => {
                    onBookingBandNameChange(newValue as string);
                }}
                className={css.band}
                renderInput={(params) => (
                    <TextField
                        {...params}
                        label="Коллектив"
                        placeholder="Необязательно"
                    />
                )}
            />
            <div className={ui.actions}>
                <button type="button" className={ui.secondary} onClick={onBookingCancel}>
                    Отмена
                </button>
                <button type="button" className={ui.primary} onClick={onBookingConfirm}>
                    Подтвердить
                </button>
            </div>
        </ModalPopup>
    );
};
/**
 * Свойства компонента RehearsalTypesSelector
 * @param rehearsalType - тип репетиции
 * @param onRehearsalTypeChange - функция, вызываемая при изменении типа репетиции
 */
interface IRehearsalTypesSelectorProps {
    rehearsalType: TRehearsalType;
    onRehearsalTypeChange: (rehearsalType: TRehearsalType) => void;
}

/**
 * Массив типов репетиций
 */
const rehearsalTypeChips: { type: TRehearsalType; label: string }[] = [
    { type: 'rehearsal', label: 'Репетиция' },
    { type: 'recording', label: 'Запись' },
    { type: 'shooting', label: 'Съемка' },
];
/**
 * Компонент RehearsalTypesSelector
 * @param {IRehearsalTypesSelectorProps} props - свойства компонента
 * @returns JSX.Element
 */
const RehearsalTypesSelector: React.FC<IRehearsalTypesSelectorProps> = ({ rehearsalType, onRehearsalTypeChange }: IRehearsalTypesSelectorProps): JSX.Element => {
    return (
        <div className={css.types} role="radiogroup" aria-label="Тип">
            {rehearsalTypeChips.map((chip) => (
                <button
                    key={chip.type}
                    type="button"
                    role="radio"
                    aria-checked={rehearsalType === chip.type}
                    className={[
                        ui.chip,
                        ui.chipChoice,
                        rehearsalTypeChipClass(chip.type),
                        rehearsalType === chip.type ? ui.chipOn : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => onRehearsalTypeChange(chip.type)}
                >
                    {chip.label}
                </button>
            ))}
        </div>
    );
};