import React from "react";
import type { Moment } from "moment";
import type { JSX } from "react";
import { Accordion, AccordionDetails, AccordionSummary, Autocomplete, Chip, TextField } from "@mui/material";
import { ModalPopup } from "@/components/ModalPopup/ModalPopup.tsx";
import { RehearsalCard } from "@/components/RehearsalCard/RehearsalCard.tsx";

import moment from "moment";
import css from "@/components/BookModalPopup/BookModalPopup.module.css";
import type { TRehearsalType } from "@/types/timetable.types";
import { ArrowDropDownIcon } from "@mui/x-date-pickers/icons";

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

const capitalizeFirstLetter = (string: string) => {
    if (string.length === 0) { // Handle empty strings
        return "";
    }
    return string.charAt(0).toUpperCase() + string.slice(1);
}

export const BookModalPopup: React.FC<IBookModalPopupProps> = ({ isOpen, onClose, selectedDate, selectedHours, bookingBandName, bandNames, onBookingBandNameChange, onBookingConfirm, onBookingCancel, username, photoUrl, rehearsalType, onRehearsalTypeChange }): JSX.Element => {
    return (
        <ModalPopup isOpen={isOpen} onClose={onClose}>
            <div className={css.bookingModal}>
                <h3 style={{ textAlign: 'left' }}>{capitalizeFirstLetter(moment(selectedDate).format('dddd'))} {moment(selectedDate).format('DD.MM.YYYY')}</h3>
                <RehearsalCard photoUrl={photoUrl} username={username} selectedHours={selectedHours} bookingBandName={bookingBandName} rehearsalType={rehearsalType} />
                <div className={css.inputGroup}>
                    <Accordion>
                        <AccordionSummary
                            expandIcon={<ArrowDropDownIcon />}
                            aria-controls="panel2-content"
                            id="panel2-header"
                        >
                            <span>Дополнительно</span>
                        </AccordionSummary>
                        <AccordionDetails sx={{ maddingTop: 0 }}>
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

interface IRehearsalTypesSelectorProps {
    rehearsalType: TRehearsalType;
    onRehearsalTypeChange: (rehearsalType: TRehearsalType) => void;
}

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

const RehearsalTypesSelector: React.FC<IRehearsalTypesSelectorProps> = ({ rehearsalType, onRehearsalTypeChange }): JSX.Element => {
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