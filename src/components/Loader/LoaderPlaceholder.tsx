import React from 'react';
import loaderCss from '@/components/Loader/Loader.module.css';

interface ILoaderPlaceholderProps {
    /** Как у Loader: на весь viewport или встроенный блок. */
    fullScreen?: boolean;
}

/**
 * Пустая область под лоадер (тот же фон), пока задержка показа не прошла.
 */
export const LoaderPlaceholder: React.FC<ILoaderPlaceholderProps> = ({ fullScreen = true }) => (
    <div
        className={fullScreen ? loaderCss.loader : loaderCss.loaderInline}
        aria-busy="true"
        aria-label="Загрузка"
    />
);
