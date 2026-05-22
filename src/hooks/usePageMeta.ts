import { useEffect } from 'react';
import { type IPageMeta, toAbsoluteUrl } from '@/config/siteMeta.ts';

const META_ATTR = 'data-page-meta';

/**
 * Находит meta-тег в head (в т.ч. из статического `index.html`).
 * @param attribute - `name` или `property`
 * @param key - Имя/свойство
 */
const findMeta = (attribute: 'name' | 'property', key: string): HTMLMetaElement | null =>
    document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);

/**
 * Обновляет существующий meta или создаёт новый (без дубликатов og:/twitter:).
 * @param attribute - `name` или `property` (Open Graph)
 * @param key - Имя/свойство тега
 * @param content - Значение content
 */
const upsertMeta = (attribute: 'name' | 'property', key: string, content: string): void => {
    let element = findMeta(attribute, key);

    if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, key);
        element.setAttribute(META_ATTR, 'true');
        document.head.appendChild(element);
    }

    element.setAttribute('content', content);
};

/**
 * Удаляет дубликаты meta с тем же ключом, оставляя один управляемый тег.
 * @param attribute - `name` или `property`
 * @param key - Имя/свойство
 */
const dedupeMeta = (attribute: 'name' | 'property', key: string): void => {
    const nodes = document.head.querySelectorAll<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
    if (nodes.length <= 1) {
        return;
    }
    const keep = nodes[nodes.length - 1];
    nodes.forEach((node) => {
        if (node !== keep) {
            node.remove();
        }
    });
};

/**
 * Удаляет meta-теги, созданные/помеченные хуком (при размонтировании).
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
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        canonical.setAttribute(META_ATTR, 'true');
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

    const metaKeys: Array<{ attribute: 'name' | 'property'; key: string }> = [
        { attribute: 'name', key: 'description' },
        { attribute: 'name', key: 'robots' },
        { attribute: 'property', key: 'og:title' },
        { attribute: 'property', key: 'og:description' },
        { attribute: 'property', key: 'og:url' },
        { attribute: 'property', key: 'og:type' },
        { attribute: 'property', key: 'og:locale' },
        { attribute: 'property', key: 'og:site_name' },
        { attribute: 'property', key: 'og:image' },
        { attribute: 'property', key: 'og:image:secure_url' },
        { attribute: 'property', key: 'og:image:width' },
        { attribute: 'property', key: 'og:image:height' },
        { attribute: 'property', key: 'og:image:alt' },
        { attribute: 'name', key: 'twitter:card' },
        { attribute: 'name', key: 'twitter:title' },
        { attribute: 'name', key: 'twitter:description' },
        { attribute: 'name', key: 'twitter:image' },
    ];
    metaKeys.forEach(({ attribute, key }) => dedupeMeta(attribute, key));
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
