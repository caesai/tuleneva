import React from 'react';

interface MusicNoteIconProps {
    className?: string;
}

/**
 * Нота для ссылки с главного экрана на публичную страницу музыки.
 * @param props.className Класс размера и цвета
 * @returns SVG без собственного имени: подпись задаёт ссылка
 */
export const MusicNoteIcon: React.FC<MusicNoteIconProps> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path
            fill="currentColor"
            d="M9.2 17.6a2.35 2.35 0 1 1-2.15-2.34V6.15l9.3-1.85v8.55a2.35 2.35 0 1 1-2.15-2.33V6.55L9.2 8.05v7.2a2.4 2.4 0 0 1 0 2.35z"
        />
    </svg>
);
