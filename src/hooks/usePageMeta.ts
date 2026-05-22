import { useEffect } from 'react';
import { type IPageMeta, toAbsoluteUrl } from '@/config/siteMeta.ts';

const META_ATTR = 'data-page-meta';

/**
 * Устанавливает или обновляет meta-тег в head.
 * @param attribute - `name` или `property` (Open Graph)
 * @param key - Имя/свойство тега
 * @param content - Значение content
 */
const upsertMeta = (attribute: 'name' | 'property', key: string, content: string): void => {
    let element = document.head.querySelector<HTMLMetaElement>(
        `meta[${attribute}="${key}"][${META_ATTR}="true"]`,
    );

    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, key);
        element.setAttribute(META_ATTR, 'true');
        document.head.appendChild(element);
    }

    element.setAttribute('content', content);
};

/**
 * Удаляет meta-теги, созданные хуком (при размонтировании).
 */
const removeManagedMeta = (): void => {
    document.head.querySelectorAll(`meta[${META_ATTR}]`).forEach((node) => node.remove());
    document.head.querySelectorAll(`link[${META_ATTR}]`).forEach((node) => node.remove());
    document.head.querySelectorAll(`script[${META_ATTR}]`).forEach((node) => node.remove());
};

/**
 * Применяет SEO / Open Graph / Twitter Card к document.
 * @param meta - Параметры страницы
 */
const applyPageMeta = (meta: IPageMeta): void => {
    document.title = meta.title;

    upsertMeta('name', 'description', meta.description);

    if (meta.robots) {
        upsertMeta('name', 'robots', meta.robots);
    }

    const canonicalUrl = toAbsoluteUrl(meta.canonicalPath ?? '/');
    let canonical = document.head.querySelector<HTMLLinkElement>(`link[rel="canonical"][${META_ATTR}]`);
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        canonical.setAttribute(META_ATTR, 'canonical');
        document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;

    upsertMeta('property', 'og:title', meta.title);
    upsertMeta('property', 'og:description', meta.description);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:type', meta.ogType ?? 'website');
    upsertMeta('property', 'og:locale', meta.locale ?? 'ru_RU');

    if (meta.siteName) {
        upsertMeta('property', 'og:site_name', meta.siteName);
    }

    if (meta.ogImagePath) {
        const imageUrl = toAbsoluteUrl(meta.ogImagePath);
        upsertMeta('property', 'og:image', imageUrl);
        upsertMeta('property', 'og:image:secure_url', imageUrl);
        if (meta.ogImageWidth) {
            upsertMeta('property', 'og:image:width', String(meta.ogImageWidth));
        }
        if (meta.ogImageHeight) {
            upsertMeta('property', 'og:image:height', String(meta.ogImageHeight));
        }
        if (meta.ogImageAlt) {
            upsertMeta('property', 'og:image:alt', meta.ogImageAlt);
        }
    }

    const twitterCard = meta.twitterCard ?? 'summary_large_image';
    upsertMeta('name', 'twitter:card', twitterCard);
    upsertMeta('name', 'twitter:title', meta.title);
    upsertMeta('name', 'twitter:description', meta.description);
    if (meta.ogImagePath) {
        upsertMeta('name', 'twitter:image', toAbsoluteUrl(meta.ogImagePath));
    }

    document.head.querySelectorAll(`script[${META_ATTR}="json-ld"]`).forEach((node) => node.remove());
    if (meta.jsonLd) {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute(META_ATTR, 'json-ld');
        script.textContent = JSON.stringify(meta.jsonLd);
        document.head.appendChild(script);
    }
};

/**
 * Синхронизирует document head с конфигом страницы (лендинг, шеринг в соцсетях).
 * @param meta - Параметры из `siteMeta.ts`
 */
export const usePageMeta = (meta: IPageMeta): void => {
    useEffect(() => {
        applyPageMeta(meta);
        return removeManagedMeta;
    }, [meta]);
};
