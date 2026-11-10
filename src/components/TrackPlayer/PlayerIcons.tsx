/**
 * @file Значки плеера: play, pause, предыдущая, следующая, громкость.
 */
import React from 'react';

interface IconProps {
    className?: string;
}

/**
 * Треугольник play.
 * @param props.className Размер
 * @returns SVG
 */
export const PlayIcon: React.FC<IconProps> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M8 5.2v13.6L19.4 12 8 5.2z" />
    </svg>
);

/**
 * Две полоски паузы.
 * @param props.className Размер
 * @returns SVG
 */
export const PauseIcon: React.FC<IconProps> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 5h4.2v14H6V5zm7.8 0H18v14h-4.2V5z" />
    </svg>
);

/**
 * Предыдущая запись.
 * @param props.className Размер
 * @returns SVG
 */
export const PreviousIcon: React.FC<IconProps> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M6 5h2.4v14H6V5zm3.6 7L19 18.4V5.6L9.6 12z" />
    </svg>
);

/**
 * Следующая запись.
 * @param props.className Размер
 * @returns SVG
 */
export const NextIcon: React.FC<IconProps> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M15.6 5H18v14h-2.4V5zM5 5.6v12.8L14.4 12 5 5.6z" />
    </svg>
);

/**
 * Динамик.
 * @param props.className Размер
 * @returns SVG
 */
export const VolumeIcon: React.FC<IconProps> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path
            fill="currentColor"
            d="M4 9h3.2L11 5.4v13.2L7.2 15H4V9zm10.2.4a4 4 0 0 1 0 5.2l-1.3-1.1a2.2 2.2 0 0 0 0-3l1.3-1.1zm2.4-2.1a7 7 0 0 1 0 9.4l-1.3-1.1a5 5 0 0 0 0-7.2l1.3-1.1z"
        />
    </svg>
);

/**
 * Звук выключен.
 * @param props.className Размер
 * @returns SVG
 */
export const VolumeOffIcon: React.FC<IconProps> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path
            fill="currentColor"
            d="M4 9h3.2L11 5.4v13.2L7.2 15H4V9zm12.1 3 2.4-2.4 1.2 1.2L17.3 13.2l2.4 2.4-1.2 1.2-2.4-2.4-2.4 2.4-1.2-1.2 2.4-2.4-2.4-2.4 1.2-1.2 2.4 2.4z"
        />
    </svg>
);
