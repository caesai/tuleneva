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
        <ellipse
            cx="8.4"
            cy="17.2"
            rx="7.5"
            ry="6.1"
            fill="currentColor"
            transform="rotate(-22 8.4 17.2)"
        />
        <path
            fill="currentColor"
            d="M14.6 1.1h3.5v16.2h-3.5zM18.1 1.1c5.2 1.4 5.6 6.4 3.6 9.2-2.2-2.4-4.4-3.4-3.6-3.6V1.1z"
        />
    </svg>
);
