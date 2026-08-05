import React from 'react';
import tulenevaLogo from '/logo_main512.svg';
import css from '@/components/Loader/Loader.module.css';

export interface ILoaderProps {
    /** true — на весь viewport; false — встроенный блок (лендинг, Suspense-секции). */
    fullScreen?: boolean;
    /** Обработчик клика по логотипу (лендинг: показать соцсети). */
    onLogoClick?: () => void;
    /** Для кнопки логотипа: раскрыты ли связанные соцсети. */
    logoAriaExpanded?: boolean;
    /** Дополнительный класс для img логотипа (лендинг: увеличенный размер). */
    logoClassName?: string;
}

/**
 * Анимированный логотип студии.
 * @param props.fullScreen - true: центр viewport; false: логотип без обёртки на 100vh
 * @param props.onLogoClick - при задании логотип становится кнопкой
 * @param props.logoAriaExpanded - aria-expanded для кнопки логотипа
 * @param props.logoClassName - доп. класс размера/стиля логотипа
 */
export const Loader: React.FC<ILoaderProps> = ({
    fullScreen = true,
    onLogoClick,
    logoAriaExpanded = false,
    logoClassName,
}) => {
    const logoClassNames = [css.logo, logoClassName].filter(Boolean).join(' ');
    const logo = <img src={tulenevaLogo} className={logoClassNames} alt="Tuleneva 25" />;

    return (
        <div className={fullScreen ? css.loader : css.loaderInline}>
            {onLogoClick ? (
                <button
                    type="button"
                    className={css.logoButton}
                    onClick={onLogoClick}
                    aria-label={logoAriaExpanded ? 'Скрыть соцсети студии' : 'Показать соцсети студии'}
                    aria-expanded={logoAriaExpanded}
                    aria-controls="landing-social-links"
                >
                    {logo}
                </button>
            ) : (
                logo
            )}
        </div>
    );
};
