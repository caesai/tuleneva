/**
 * @file Запоминает `?from=` или `?utm_source=` на время вкладки, с какой страницы ни зашли.
 */
import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { captureListenSource } from '@/music/listenStats.ts';

/**
 * Читает метку при заходе и при смене query. Без параметра прежнюю метку не стирает.
 * @returns null
 */
export const ListenAttribution: React.FC = () => {
    const { search } = useLocation();
    useEffect(() => {
        captureListenSource(search);
    }, [search]);
    return null;
};
