/**
 * @file Значки страниц музыки: цепочка на запись и «поделиться».
 */
import React from 'react';

interface IconProps {
    className?: string;
}

/**
 * Два звена цепи. Стоит на ссылке, которая открывает страницу записи.
 * @param props.className Размер и цвет
 * @returns SVG
 */
export const LinkChainIcon: React.FC<IconProps> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <g
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            transform="rotate(-45 12 12)"
        >
            <rect x="1.8" y="8.6" width="12.2" height="6.8" rx="3.4" />
            <rect x="10" y="8.6" width="12.2" height="6.8" rx="3.4" />
        </g>
    </svg>
);

/**
 * Стрелка из рамки — поделиться страницей.
 * @param props.className Размер и цвет
 * @returns SVG
 */
export const ShareIcon: React.FC<IconProps> = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path
            fill="currentColor"
            d="M13 3.2 18.8 9H15v6h-4V9H7.2L13 3.2zM5 14.2h2.2V19h9.6v-4.8H19V21H5v-6.8z"
        />
    </svg>
);
