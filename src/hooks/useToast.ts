// src/hooks/useToast.ts
import { useState, useCallback } from 'react';
import type { ToastMessage, ToastType } from '@/components/Toast/Toast';

/**
 * Хук для управления toast-уведомлениями.
 * 
 * @returns {object} Объект с методами:
 * - toasts: массив текущих toast-сообщений
 * - showToast: функция для показа нового toast
 * - removeToast: функция для удаления toast по id
 */
export const useToast = () => {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newToast: ToastMessage = { id, message, type, duration };
        
        setToasts(prev => [...prev, newToast]);
        
        return id;
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
    }, []);

    return {
        toasts,
        showToast,
        removeToast,
    };
};
