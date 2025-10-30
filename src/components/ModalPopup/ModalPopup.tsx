// src/Modal.js
import React, { type ReactNode, useEffect } from 'react';
import css from '@/components/ModalPopup/ModalPopup.module.css';

interface ModalPopupProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
}

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
