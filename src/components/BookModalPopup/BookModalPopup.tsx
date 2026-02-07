import React from "react";
import type { Moment } from "moment";
import type { JSX } from "react";
import { Accordion, AccordionDetails, Autocomplete, Chip, Divider, TextField } from "@mui/material";
import { ModalPopup } from "@/components/ModalPopup/ModalPopup.tsx";
import { RehearsalCard } from "@/components/RehearsalCard/RehearsalCard.tsx";
import moment from "moment";
import css from "@/components/BookModalPopup/BookModalPopup.module.css";
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
    const [expanded, setExpanded] = React.useState(false);
    const toggle = () => setExpanded(!expanded);
    return (
        <ModalPopup isOpen={isOpen} onClose={onClose}>
            <div className={css.bookingModal}>
                <h3 style={{ textAlign: 'left' }}>{capitalizeFirstLetter(moment(selectedDate).format('dddd'))} {moment(selectedDate).format('DD.MM.YYYY')}</h3>
                <Divider sx={{ marginBottom: '10px'}} />
                <RehearsalCard photoUrl={photoUrl} username={username} selectedHours={selectedHours} bookingBandName={bookingBandName} rehearsalType={rehearsalType} />
                <div className={css.inputGroup}>
                    <Accordion expanded={expanded} onChange={toggle} elevation={0}>
                        <Divider id="panel2-header" role="button" textAlign={expanded ? "right" : "left"} onClick={toggle}>
                            <Chip label="Дополнительно" size="small" />
                        </Divider>
                        <AccordionDetails sx={{ maddingTop: 0, padding: 0 }}>
                            <RehearsalTypesSelector rehearsalType={rehearsalType} onRehearsalTypeChange={onRehearsalTypeChange} />
                            <Autocomplete
                                freeSolo
                                disablePortal
                                options={bandNames}
                                inputValue={bookingBandName}
                                onInputChange={(_event, newValue) => {
                                    onBookingBandNameChange(newValue as string);
                                }}
                                sx={{ width: 300 }}
                                renderInput={(params) => <TextField {...params} label="Название коллектива (опционально)" />}
                            />
                        </AccordionDetails>
                    </Accordion>
                </div>

                <div className={css.modalButtons}>
                    <button className={css.confirmButton} onClick={onBookingConfirm}>
                        Подтвердить
                    </button>
                    <button className={css.cancelButton} onClick={onBookingCancel}>
                        Отмена
                    </button>
                </div>
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
const rehearsalTypeChips = [
    {
        type: 'rehearsal',
        label: 'Репетиция',
        color: 'info'
    },
    {
        type: 'recording',
        label: 'Запись',
        color: 'error'
    },
    {
        type: 'shooting',
        label: 'Съемка',
        color: 'success'
    }
]
/**
 * Компонент RehearsalTypesSelector
 * @param {IRehearsalTypesSelectorProps} props - свойства компонента
 * @returns JSX.Element
 */
const RehearsalTypesSelector: React.FC<IRehearsalTypesSelectorProps> = ({ rehearsalType, onRehearsalTypeChange }: IRehearsalTypesSelectorProps): JSX.Element => {
    return (
        <div className={css.rehearsalTypes}>
            {rehearsalTypeChips.map((chip) => (
                <Chip
                    variant={rehearsalType === chip.type ? "filled" : "outlined"}
                    color={chip.color as 'info' | 'error' | 'success'}
                    size="small"
                    label={chip.label}
                    sx={{ fontSize: 10, marginTop: '5px' }}
                    onClick={() => onRehearsalTypeChange(chip.type as TRehearsalType)}
                />
            ))}
        </div>
    );
};