import { useState, type FC, type ImgHTMLAttributes } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import css from './skeleton.module.css';

/**
 * Обложка в фиксированной рамке: серый прямоугольник сразу, картинка проявляется после загрузки.
 * Класс размера вешается на рамку, чтобы вёрстка не прыгала.
 * @param props Обычные атрибуты img, включая className рамки
 */
export const FadeImg: FC<ImgHTMLAttributes<HTMLImageElement>> = ({ className, onLoad, alt = '', ...rest }) => {
    const [ready, setReady] = useState(false);
    const reduced = usePrefersReducedMotion();
    return (
        <span className={`${css.frame} ${className ?? ''}`}>
            <img
                {...rest}
                alt={alt}
                className={`${css.photo} ${ready ? css.photoIn : ''} ${reduced ? css.noFade : ''}`}
                onLoad={(event) => {
                    setReady(true);
                    onLoad?.(event);
                }}
            />
        </span>
    );
};
