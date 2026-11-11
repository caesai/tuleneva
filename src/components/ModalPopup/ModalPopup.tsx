/**
 * @file Общий диалог: заголовок, крестик, содержимое.
 * На узком экране и в Telegram открывается снизу, на широком — по центру.
 */
import React, { type ReactNode, useEffect } from 'react';
import { CloseIcon } from '@/components/Icons/Icons.tsx';
import css from '@/components/ModalPopup/ModalPopup.module.css';

interface ModalPopupProps {
    /** Флаг видимости */
    isOpen: boolean;
    /** Закрытие по фону, Esc и крестику */
    onClose: () => void;
    /** Заголовок. Без него остаётся только крестик. */
    title?: string;
    /** Содержимое */
    children: ReactNode;
}

/**
 * Модальное окно с единой шапкой.
 * @param props Видимость, заголовок и содержимое
 * @returns Диалог или null
 */
export const ModalPopup: React.FC<ModalPopupProps> = ({ isOpen, onClose, title, children }) => {
    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEscapeKey);
        return () => {
            window.removeEventListener('keydown', handleEscapeKey);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className={css.overlay} onClick={onClose}>
            <div
                className={css.sheet}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? 'modal-title' : undefined}
                onClick={(event) => event.stopPropagation()}
            >
                <div className={css.head}>
                    {title ? <h2 id="modal-title" className={css.title}>{title}</h2> : null}
                    <button type="button" className={css.close} onClick={onClose} aria-label="Закрыть">
                        <CloseIcon className={css.icon} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
};
