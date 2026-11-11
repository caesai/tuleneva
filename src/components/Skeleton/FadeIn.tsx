import type { FC, ReactNode } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import css from './skeleton.module.css';

/**
 * Коротко проявляет уже готовый блок. При уменьшенном движении класс не ставится.
 * @param props.children Содержимое
 */
export const FadeIn: FC<{ children: ReactNode }> = ({ children }) => {
    const reduced = usePrefersReducedMotion();
    return <div className={reduced ? undefined : css.fade}>{children}</div>;
};
