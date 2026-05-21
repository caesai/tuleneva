import { useMemo } from 'react';
import {
    isLaunchParamsRetrieveError,
    retrieveLaunchParams,
    retrieveRawInitData,
    type LaunchParams,
} from '@telegram-apps/sdk-react';
import { WEB_FALLBACK_LAUNCH_PARAMS } from '@/telegram/env.ts';

export type SafeLaunchParams = {
    launchParams: LaunchParams;
    isTelegram: boolean;
};

export function getSafeLaunchParams(): SafeLaunchParams {
    try {
        return { launchParams: retrieveLaunchParams(), isTelegram: true };
    } catch (error) {
        if (isLaunchParamsRetrieveError(error)) {
            return { launchParams: WEB_FALLBACK_LAUNCH_PARAMS, isTelegram: false };
        }
        throw error;
    }
}

export function useSafeLaunchParams(): SafeLaunchParams {
    return useMemo(getSafeLaunchParams, []);
}

export function useSafeRawInitData(): string | undefined {
    return useMemo(() => {
        try {
            const data = retrieveRawInitData();
            return data || undefined;
        } catch (error) {
            if (isLaunchParamsRetrieveError(error)) {
                return undefined;
            }
            throw error;
        }
    }, []);
}
