import type { Dispatch, SetStateAction } from 'react';
import moment, { type Moment } from '@/lib/moment';
import { APICancelBooking, APIPostBookRehearsal, readBookFailure } from '@/api/timetable.api.ts';
import type { TRehearsalType } from '@/types/timetable.types';
import type { ToastType } from '@/components/Toast/Toast';

/**
 * История названий групп из localStorage.
 * @returns Сохранённые названия; пустой список, если записи нет
 */
export const readSavedBandNames = (): string[] => {
    const raw = localStorage.getItem('userSettings');
    const settings = raw ? JSON.parse(raw) : {};
    return settings.bandNames || [];
};

export interface IUseTimeTableBookingOptions {
    /** Можно ли бронировать и отменять */
    canManageBookings: boolean;
    /** Есть ли сеть */
    isOnline: boolean;
    /** Выбранный день */
    selectedDate: Moment | null;
    /** Часы в форме брони */
    selectedHours: string[];
    /** Часы, отмеченные к отмене */
    hoursToCancel: string[];
    /** Название группы из модалки */
    bookingBandName: string;
    /** Тип слота из модалки */
    rehearsalType: TRehearsalType;
    /** Уже сохранённые названия групп */
    bandNames: string[];
    /** Тост об успехе или ошибке */
    showToast: (message: string, type?: ToastType) => void;
    /** Перечитать слоты выбранного дня */
    fetchBookedHours: (targetDate: Moment) => Promise<void>;
    /** Перечитать подсветку месяца */
    refetch: () => void;
    /** Закрыть модалку подтверждения */
    closeBookingModal: () => void;
    /** Обновить выбранные для брони часы */
    setSelectedHours: Dispatch<SetStateAction<string[]>>;
    /** Обновить часы, отмеченные к отмене */
    setHoursToCancel: Dispatch<SetStateAction<string[]>>;
}

/**
 * Бронь и отмена слотов выбранного дня.
 * Снимает часы, которые сервер отверг, и заново читает расписание.
 * @param options Состояние страницы и колбэки загрузки
 * @returns Обработчики кнопок «Забронировать» и «Отменить»
 */
export const useTimeTableBooking = ({
    canManageBookings,
    isOnline,
    selectedDate,
    selectedHours,
    hoursToCancel,
    bookingBandName,
    rehearsalType,
    bandNames,
    showToast,
    fetchBookedHours,
    refetch,
    closeBookingModal,
    setSelectedHours,
    setHoursToCancel,
}: IUseTimeTableBookingOptions) => {
    /**
     * Заново читает день и подсветку месяца, чтобы сетка совпала с сервером.
     */
    const reloadSelectedDay = async () => {
        if (selectedDate) {
            await fetchBookedHours(selectedDate);
        }
        refetch();
    };

    /**
     * Отправляет бронь выбранных часов.
     * Отказ 409/400 снимает отклонённые часы и перечитывает день.
     */
    const handleBooking = async () => {
        if (!canManageBookings) return;

        if (!isOnline) {
            showToast('Нет подключения к интернету. Попробуйте позже.', 'error');
            return;
        }

        try {
            const response = await APIPostBookRehearsal(
                moment(selectedDate).format('DD/MM/YYYY'),
                selectedHours,
                bookingBandName,
                rehearsalType,
            );
            if (!response.ok) {
                const failure = await readBookFailure(response);
                if (failure.rejectedHours.length > 0) {
                    setSelectedHours((prev) => prev.filter((hour) => !failure.rejectedHours.includes(hour)));
                }
                await reloadSelectedDay();
                showToast(failure.message, 'error');
                return;
            }
            if (bookingBandName && !bandNames.includes(bookingBandName)) {
                const updatedSettings = {
                    ...(localStorage.getItem('userSettings')
                        ? JSON.parse(localStorage.getItem('userSettings') as string)
                        : {}),
                    bandNames: [...bandNames, bookingBandName],
                };
                localStorage.setItem('userSettings', JSON.stringify(updatedSettings));
            }
            setSelectedHours([]);
            await reloadSelectedDay();
            closeBookingModal();
            showToast('Время успешно забронировано!', 'success');
        } catch (err) {
            console.error('Booking failed:', err);
            showToast('Не удалось забронировать время.', 'error');
        }
    };

    /**
     * Отменяет отмеченные часы.
     * 409 перечитывает день: слот уже мог сменить владельца.
     */
    const handleCancel = async () => {
        if (!canManageBookings) return;

        if (!isOnline) {
            showToast('Нет подключения к интернету. Попробуйте позже.', 'error');
            return;
        }

        try {
            const response = await APICancelBooking(
                moment(selectedDate).format('DD/MM/YYYY'),
                hoursToCancel,
            );
            if (!response.ok) {
                setHoursToCancel([]);
                await reloadSelectedDay();
                showToast(
                    response.status === 409
                        ? 'Слоты уже изменились. Расписание обновлено.'
                        : 'Не удалось отменить бронирование.',
                    'error',
                );
                return;
            }
            setHoursToCancel([]);
            await reloadSelectedDay();
            showToast('Бронирование отменено.', 'success');
        } catch (err) {
            console.error('Cancellation failed:', err);
            showToast('Не удалось отменить бронирование.', 'error');
        }
    };

    return { handleBooking, handleCancel };
};
