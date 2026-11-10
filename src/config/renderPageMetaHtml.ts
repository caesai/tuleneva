/**
 * @file Сборка блока meta для index.html из клиентских констант siteMeta.
 */
import { renderHtmlPageMeta } from '../../shared/pageMetaHtml.ts';
import { type IPageMeta, toAbsoluteUrl } from './siteMeta.ts';

/**
 * Генерирует блок `<title>`, meta, canonical и JSON-LD для `index.html`.
 * @param meta Параметры страницы из `siteMeta.ts`
 * @returns HTML-фрагмент между маркерами tuleneva:page-meta
 */
export const renderPageMetaHtml = (meta: IPageMeta): string => renderHtmlPageMeta({
    title: meta.title,
    description: meta.description,
    canonicalUrl: toAbsoluteUrl(meta.canonicalPath ?? '/'),
    ogType: meta.ogType,
    locale: meta.locale,
    siteName: meta.siteName,
    robots: meta.robots,
    imageUrl: meta.ogImagePath ? toAbsoluteUrl(meta.ogImagePath) : undefined,
    imageWidth: meta.ogImageWidth,
    imageHeight: meta.ogImageHeight,
    imageAlt: meta.ogImageAlt,
    twitterCard: meta.twitterCard,
    jsonLd: meta.jsonLd,
});
