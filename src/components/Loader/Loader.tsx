import React from 'react';
import tulenevaLogo from '/logo_main512.svg';
import css from '@/components/Loader/Loader.module.css';

export interface ILoaderProps {
    /** true — на весь viewport; false — встроенный блок (лендинг, Suspense-секции). */
    fullScreen?: boolean;
}

/**
 * Анимированный логотип студии.
 * @param props.fullScreen - true: центр viewport; false: логотип без обёртки на 100vh
 */
export const Loader: React.FC<ILoaderProps> = ({ fullScreen = true }) => {
    return (
        <div className={fullScreen ? css.loader : css.loaderInline}>
            <img src={tulenevaLogo} className={css.logo} alt="Tuleneva 25" />
        </div>
    );
};
