import React, { useEffect, useState } from 'react';
import { Loader } from '@/components/Loader/Loader.tsx';
import { LoaderPlaceholder } from '@/components/Loader/LoaderPlaceholder.tsx';
import { LOADER_TIMING } from '@/hooks/useDelayedLoading.ts';

interface ISuspenseLoaderFallbackProps {
    fullScreen?: boolean;
    className?: string;
}

/**
 * Fallback для React Suspense: короткая задержка, чтобы не мигать при быстрой подгрузке чанка.
 */
export const SuspenseLoaderFallback: React.FC<ISuspenseLoaderFallbackProps> = ({
    fullScreen = false,
    className,
}) => {
    const [showLoader, setShowLoader] = useState(false);

    useEffect(() => {
        const timer = window.setTimeout(
            () => setShowLoader(true),
            LOADER_TIMING.suspenseShowDelayMs,
        );
        return () => clearTimeout(timer);
    }, []);

    if (showLoader) {
        return (
            <div className={className}>
                <Loader fullScreen={fullScreen} />
            </div>
        );
    }

    return (
        <div className={className}>
            <LoaderPlaceholder fullScreen={fullScreen} />
        </div>
    );
};
