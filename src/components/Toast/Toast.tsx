// src/components/Toast/Toast.tsx
import React, { useEffect, useState } from 'react';
import css from './Toast.module.css';

export type ToastType = 'error' | 'success' | 'warning' | 'info';

export interface ToastMessage {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastItemProps {
    toast: ToastMessage;
    onRemove: (id: string) => void;
}

const getIcon = (type: ToastType): string => {
    switch (type) {
        case 'error': return '✕';
        case 'success': return '✓';
        case 'warning': return '⚠';
        case 'info': return 'ℹ';
    }
};

/**
 * Отдельный toast-элемент с автоматическим скрытием.
 */
const ToastItem: React.FC<ToastItemProps> = ({ toast, onRemove }) => {
    const [isHiding, setIsHiding] = useState(false);
    const duration = toast.duration ?? 4000;

    useEffect(() => {
        const hideTimer = setTimeout(() => {
            setIsHiding(true);
        }, duration);

        const removeTimer = setTimeout(() => {
            onRemove(toast.id);
        }, duration + 300); // +300ms для анимации

        return () => {
            clearTimeout(hideTimer);
            clearTimeout(removeTimer);
        };
    }, [toast.id, duration, onRemove]);

    const handleClose = () => {
        setIsHiding(true);
        setTimeout(() => onRemove(toast.id), 300);
    };

    return (
        <div className={`${css.toast} ${css[toast.type]} ${isHiding ? css.hiding : ''}`}>
            <span className={css.icon}>{getIcon(toast.type)}</span>
            <span className={css.message}>{toast.message}</span>
            <button className={css.closeButton} onClick={handleClose}>
                ×
            </button>
        </div>
    );
};

interface ToastContainerProps {
    toasts: ToastMessage[];
    onRemove: (id: string) => void;
}

/**
 * Контейнер для отображения списка toast-уведомлений.
 */
export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
    if (toasts.length === 0) return null;

    return (
        <div className={css.toastContainer}>
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
            ))}
        </div>
    );
};
