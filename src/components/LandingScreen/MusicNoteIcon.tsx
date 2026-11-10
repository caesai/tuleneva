import React from 'react';

interface MusicNoteIconProps {
    className?: string;
}

/**
 * Две залитые восьмые под одной балкой.
 * Своя форма, не чужой файл иконки. Цвет берётся у ссылки.
 * @param props.className Класс размера и цвета
 * @returns SVG без собственного имени: подпись задаёт ссылка
 */
export const MusicNoteIcon: React.FC<MusicNoteIconProps> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <ellipse
            cx="6.2"
            cy="18.4"
            rx="4.35"
            ry="3.15"
            fill="currentColor"
            transform="rotate(-30 6.2 18.4)"
        />
        <ellipse
            cx="17.15"
            cy="18.4"
            rx="4.35"
            ry="3.15"
            fill="currentColor"
            transform="rotate(-30 17.15 18.4)"
        />
        <path
            fill="currentColor"
            d="M8.55 2.05h2.2V16.35h-2.2zm10.7 4.15h2.2V16.35h-2.2zM8.55 2.05 21.45 6.2v2.4L8.55 4.45z"
        />
    </svg>
);
