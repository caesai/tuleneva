// src/hooks/useNetworkStatus.ts
import { useState, useEffect, useCallback } from 'react';

/**
 * Хук для отслеживания состояния сетевого подключения.
 * Использует браузерные события online/offline для мгновенного реагирования.
 * 
 * @returns {object} Объект, содержащий:
 * - isOnline: текущий статус подключения (true = онлайн).
 * - wasOffline: флаг, что было отключение (для триггера обновления данных).
 * - clearWasOffline: функция для сброса флага wasOffline.
 */
export const useNetworkStatus = () => {
    const [isOnline, setIsOnline] = useState<boolean>(() => {
        // Проверяем начальное состояние при инициализации
        return typeof navigator !== 'undefined' ? navigator.onLine : true;
    });
    
    // Флаг для отслеживания, что было отключение (для триггера refetch)
    const [wasOffline, setWasOffline] = useState<boolean>(false);

    const handleOnline = useCallback(() => {
        setIsOnline(true);
        // Если были офлайн, устанавливаем флаг для триггера обновления
        setWasOffline(true);
    }, []);

    const handleOffline = useCallback(() => {
        setIsOnline(false);
    }, []);

    // Функция для сброса флага wasOffline после обновления данных
    const clearWasOffline = useCallback(() => {
        setWasOffline(false);
    }, []);

    useEffect(() => {
        // Подписываемся на события браузера
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Синхронизируем состояние при монтировании
        setIsOnline(navigator.onLine);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [handleOnline, handleOffline]);

    return {
        isOnline,
        wasOffline,
        clearWasOffline,
    };
};
