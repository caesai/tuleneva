import React from 'react';
import { Loader, type ILoaderProps } from '@/components/Loader/Loader.tsx';
import { LoaderPlaceholder } from '@/components/Loader/LoaderPlaceholder.tsx';
import { useDelayedLoading, type IDelayedLoadingOptions } from '@/hooks/useDelayedLoading.ts';

interface IDelayedLoaderProps extends ILoaderProps {
    /** Активна ли загрузка (до применения задержек). */
    active: boolean;
    /** Параметры задержки показа/скрытия. */
    timing?: IDelayedLoadingOptions;
    /** Резерв места, пока лоадер ещё не показан (Suspense, overlay). */
    reserveSpace?: boolean;
}

/**
 * Loader с анти-миганием: показ не раньше showDelayMs, скрытие не раньше minVisibleMs.
 */
export const DelayedLoader: React.FC<IDelayedLoaderProps> = ({
    active,
    timing,
    reserveSpace = false,
    fullScreen = true,
}) => {
    const showLoader = useDelayedLoading(active, timing);

    if (!active) {
        return null;
    }

    if (showLoader) {
        return <Loader fullScreen={fullScreen} />;
    }

    if (reserveSpace) {
        return <LoaderPlaceholder fullScreen={fullScreen} />;
    }

    return null;
};
