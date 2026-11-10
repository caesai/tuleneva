/**
 * @file Шапка страниц музыки: логотип ведёт на главную, рядом слово «Музыка».
 */
import React from 'react';
import { Link } from 'react-router-dom';
import css from './MusicPage.module.css';

interface MusicHeaderProps {
    /** На каталоге «Музыка» — заголовок страницы. На подборке и записи свой h1. */
    heading?: boolean;
    /** Кнопка справа, например «Поделиться». */
    children?: React.ReactNode;
}

/**
 * Логотип и подпись в одну строку.
 * @param props.heading Сделать подпись заголовком h1
 * @param props.children Узел у правого края
 * @returns Шапка
 */
export const MusicHeader: React.FC<MusicHeaderProps> = ({ heading = false, children }) => (
    <header className={css.header}>
        <Link to="/" className={css.brand}>
            <img src="/logo_main512.svg" alt="" width={36} height={36} />
            {heading
                ? <h1 className={css.brandName}>Музыка</h1>
                : <span className={css.brandName}>Музыка</span>}
        </Link>
        {children}
    </header>
);
