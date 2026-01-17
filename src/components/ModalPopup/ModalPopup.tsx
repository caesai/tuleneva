// src/Modal.js
import React, { type ReactNode, useEffect } from 'react';
import css from '@/components/ModalPopup/ModalPopup.module.css';

/**
 * Свойства компонента ModalPopup.
 */
interface ModalPopupProps {
    /** Флаг, определяющий видимость модального окна. */
    isOpen: boolean;
    /** Функция обратного вызова для закрытия модального окна. */
    onClose: () => void;
    /** Содержимое модального окна. */
    children: ReactNode;
}

/**
 * Универсальный компонент модального окна.
 * Поддерживает закрытие по клику на фон и нажатию Esc.
 *
 * @component
 */
export const ModalPopup: React.FC<ModalPopupProps> = ({ isOpen, onClose, children }) => {
    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        if (isOpen) {
            window.addEventListener('keydown', handleEscapeKey);
        }
        return () => {
            window.removeEventListener('keydown', handleEscapeKey);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className={css.modalOverlay} onClick={onClose}>
            <div className={css.modalContent} onClick={(e) => e.stopPropagation()}>
                <button className={css.modalCloseButton} onClick={onClose}>
                    &times;
                </button>
                {children}
            </div>
        </div>
    );
};
