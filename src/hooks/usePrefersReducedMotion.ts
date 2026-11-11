import { useEffect, useState } from 'react';

/**
 * Следит за системной настройкой «меньше движения».
 * @returns true, если анимации нужно отключить
 */
export const usePrefersReducedMotion = (): boolean => {
    const [reduced, setReduced] = useState(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return false;
        }
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    });

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') {
            return undefined;
        }
        const media = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = () => setReduced(media.matches);
        onChange();
        media.addEventListener('change', onChange);
        return () => media.removeEventListener('change', onChange);
    }, []);

    return reduced;
};
