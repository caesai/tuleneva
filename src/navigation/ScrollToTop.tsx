/**
 * @file Прокрутка при смене маршрута.
 * Переход вперёд открывает страницу сверху. Назад и вперёд по истории
 * возвращают то место, где страницу оставили.
 */
import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Следит за историей и ставит `window` в нужную позицию.
 * @returns null
 */
export const ScrollToTop: React.FC = () => {
    const location = useLocation();
    const navigationType = useNavigationType();
    const positions = useRef(new Map<string, number>());

    useEffect(() => {
        const saved = positions.current;
        const key = location.key;
        if (navigationType === 'POP') {
            window.scrollTo(0, saved.get(key) ?? 0);
        } else {
            window.scrollTo(0, 0);
        }
        return () => {
            saved.set(key, window.scrollY);
        };
    }, [location.key, navigationType]);

    return null;
};
