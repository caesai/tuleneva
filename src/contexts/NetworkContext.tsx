import React, { type ReactNode } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { NetworkBanner } from '@/components/NetworkBanner/NetworkBanner';
import { NetworkContext } from './NetworkContextDefinition.ts';

interface NetworkProviderProps {
    children: ReactNode;
}

export const NetworkProvider: React.FC<NetworkProviderProps> = ({ children }) => {
    const { isOnline, wasOffline, clearWasOffline } = useNetworkStatus();

    return (
        <NetworkContext.Provider value={{ isOnline, wasOffline, clearWasOffline }}>
            <NetworkBanner isOnline={isOnline} />
            {children}
        </NetworkContext.Provider>
    );
};
