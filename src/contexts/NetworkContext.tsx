// src/contexts/NetworkContext.tsx
import React, { createContext, useContext, type ReactNode } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { NetworkBanner } from '@/components/NetworkBanner/NetworkBanner';

/**
 * Интерфейс контекста сетевого подключения.
 */
interface NetworkContextType {
    /** Текущий статус подключения (true = онлайн) */
    isOnline: boolean;
    /** Флаг, что было отключение (для триггера обновления данных) */
    wasOffline: boolean;
    /** Функция для сброса флага wasOffline после обновления данных */
    clearWasOffline: () => void;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

interface NetworkProviderProps {
    children: ReactNode;
}

/**
 * Провайдер контекста сетевого подключения.
 * Оборачивает приложение и предоставляет информацию о состоянии сети.
 * Включает NetworkBanner для отображения статуса.
 */
export const NetworkProvider: React.FC<NetworkProviderProps> = ({ children }) => {
    const { isOnline, wasOffline, clearWasOffline } = useNetworkStatus();

    return (
        <NetworkContext.Provider value={{ isOnline, wasOffline, clearWasOffline }}>
            <NetworkBanner isOnline={isOnline} />
            {children}
        </NetworkContext.Provider>
    );
};

/**
 * Хук для использования контекста сетевого подключения.
 * @throws {Error} Если используется вне NetworkProvider.
 */
export const useNetwork = (): NetworkContextType => {
    const context = useContext(NetworkContext);
    if (context === undefined) {
        throw new Error('useNetwork must be used within a NetworkProvider');
    }
    return context;
};
