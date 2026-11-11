import { Skeleton } from '@mui/material';
import type { FC } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface IBoneProps {
    /** Высота в пикселях */
    height: number;
    /** Ширина: число в пикселях или CSS-значение */
    width?: number | string;
    /** Круг вместо скруглённого прямоугольника */
    circle?: boolean;
    /** Радиус, если это не круг */
    radius?: number;
    className?: string;
}

/**
 * Одна плашка скелета в цветах темы: серый #f3f3f3, радиус 12, лёгкая волна.
 * При `prefers-reduced-motion` волна выключена.
 * @param props Размер плашки
 */
export const Bone: FC<IBoneProps> = ({ height, width = '100%', circle = false, radius = 12, className }) => {
    const reduced = usePrefersReducedMotion();
    return (
        <Skeleton
            className={className}
            variant={circle ? 'circular' : 'rounded'}
            animation={reduced ? false : 'wave'}
            width={circle ? height : width}
            height={height}
            sx={circle ? undefined : { borderRadius: `${radius}px` }}
        />
    );
};
