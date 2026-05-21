import { createContext } from 'react';

export interface NetworkContextType {
    isOnline: boolean;
    wasOffline: boolean;
    clearWasOffline: () => void;
}

export const NetworkContext = createContext<NetworkContextType | undefined>(undefined);
