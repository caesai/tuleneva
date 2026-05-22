import { lazy } from 'react';

/**
 * Async-чанки с MUI: календарь (X Date Pickers), вкладки дня (Lab), модалка бронирования.
 */
export const LazyTimeTableCalendarBlock = lazy(() =>
    import('@/pages/TimeTablePage/TimeTableCalendarBlock.tsx').then((m) => ({
        default: m.TimeTableCalendarBlock,
    })),
);

export const LazyTimeTableDayTabs = lazy(() =>
    import('@/pages/TimeTablePage/TimeTableDayTabs.tsx').then((m) => ({
        default: m.TimeTableDayTabs,
    })),
);

export const LazyBookModalPopup = lazy(() =>
    import('@/components/BookModalPopup/BookModalPopup.tsx').then((m) => ({
        default: m.BookModalPopup,
    })),
);

/**
 * Предзагрузка чанков календаря и вкладок после первой отрисовки расписания.
 */
export const preloadTimeTableMuiChunks = (): void => {
    void import('@/pages/TimeTablePage/TimeTableCalendarBlock.tsx');
    void import('@/pages/TimeTablePage/TimeTableDayTabs.tsx');
};

/**
 * Предзагрузка модалки бронирования (тяжёлый Autocomplete).
 */
export const preloadBookModalChunk = (): void => {
    void import('@/components/BookModalPopup/BookModalPopup.tsx');
};
