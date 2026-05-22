/**
 * @file SEO и Open Graph для публичного сайта tuleneva25.ru.
 */

/** Канонический origin продакшена (шеринг, canonical, og:image). */
export const SITE_ORIGIN = 'https://tuleneva25.ru';

/**
 * Собирает абсолютный URL для meta-тегов.
 * @param path - Путь от корня (`/og-image.jpg`) или полный URL
 * @returns Абсолютный URL
 */
export const toAbsoluteUrl = (path: string): string => {
    if (/^https?:\/\//i.test(path)) {
        return path;
    }
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${SITE_ORIGIN}${normalized}`;
};

/** Параметры страницы для document.title и meta-тегов. */
export interface IPageMeta {
    title: string;
    description: string;
    canonicalPath?: string;
    ogImagePath?: string;
    ogImageWidth?: number;
    ogImageHeight?: number;
    ogImageAlt?: string;
    ogType?: string;
    locale?: string;
    siteName?: string;
    robots?: string;
    twitterCard?: 'summary' | 'summary_large_image';
    /** JSON-LD (schema.org) для поисковиков. */
    jsonLd?: Record<string, unknown>;
}

/**
 * Метаданные главной страницы (лендинг `/`).
 * В `index.html` попадают при сборке из `index.template.html` (плагин `indexHtmlMetaPlugin`).
 */
export const LANDING_PAGE_META: IPageMeta = {
    title: 'Тюленева 25 — музыкальная студия, Москва, Тёплый Стан',
    description:
        'Творческое объединение.',
    canonicalPath: '/',
    ogImagePath: '/og-image.jpg',
    ogImageWidth: 1024,
    ogImageHeight: 1467,
    ogImageAlt: 'Тюленева 25 — музыкальная студия',
    ogType: 'website',
    locale: 'ru_RU',
    siteName: 'Тюленева 25',
    robots: 'index, follow',
    twitterCard: 'summary_large_image',
    jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'MusicVenue',
        name: 'Тюленева 25',
        description:
            'Музыкальная студия в Москве (Тёплый Стан).',
        url: SITE_ORIGIN,
        image: toAbsoluteUrl('/og-image.jpg'),
        address: {
            '@type': 'PostalAddress',
            streetAddress: 'ул. Тюленева, 25',
            addressLocality: 'Москва',
            addressCountry: 'RU',
        },
        sameAs: [
            'https://t.me/tuleneva25_bot',
            'https://vk.com/tuleneva25',
            'https://www.youtube.com/@tuleneva25',
        ],
    },
};

/**
 * Метаданные страницы расписания (`/app`).
 * В статическом `index.html` остаётся лендинг; при открытии SPA хук обновляет head под маршрут.
 */
export const APP_PAGE_META: IPageMeta = {
    title: 'Расписание — Тюленева 25',
    description:
        'Бронирование репетиций в музыкальной студии «Тюленева 25», Москва, Тёплый Стан.',
    canonicalPath: '/app',
    ogImagePath: '/og-image.jpg',
    ogImageWidth: 1024,
    ogImageHeight: 1467,
    ogImageAlt: 'Тюленева 25 — расписание репетиций',
    ogType: 'website',
    locale: 'ru_RU',
    siteName: 'Тюленева 25',
    robots: 'index, follow',
    twitterCard: 'summary_large_image',
};
