import { type IPageMeta, toAbsoluteUrl } from './siteMeta.ts';

/**
 * Экранирует текст для HTML-атрибутов и текстовых узлов.
 * @param value - Исходная строка
 * @returns Безопасная для вставки в HTML строка
 */
const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

/**
 * Генерирует блок `<title>`, meta, canonical и JSON-LD для `index.html`.
 * @param meta - Параметры страницы из `siteMeta.ts`
 * @returns HTML-фрагмент (с отступом в 2 пробела)
 */
export const renderPageMetaHtml = (meta: IPageMeta): string => {
    const canonicalUrl = toAbsoluteUrl(meta.canonicalPath ?? '/');
    const imageUrl = meta.ogImagePath ? toAbsoluteUrl(meta.ogImagePath) : '';
    const lines: string[] = [];

    lines.push(`  <title>${escapeHtml(meta.title)}</title>`);
    lines.push(`  <meta name="description" content="${escapeHtml(meta.description)}" />`);

    if (meta.robots) {
        lines.push(`  <meta name="robots" content="${escapeHtml(meta.robots)}" />`);
    }

    lines.push(`  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`);
    lines.push(`  <meta property="og:type" content="${escapeHtml(meta.ogType ?? 'website')}" />`);
    lines.push(`  <meta property="og:locale" content="${escapeHtml(meta.locale ?? 'ru_RU')}" />`);

    if (meta.siteName) {
        lines.push(`  <meta property="og:site_name" content="${escapeHtml(meta.siteName)}" />`);
    }

    lines.push(`  <meta property="og:title" content="${escapeHtml(meta.title)}" />`);
    lines.push(`  <meta property="og:description" content="${escapeHtml(meta.description)}" />`);
    lines.push(`  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`);

    if (imageUrl) {
        lines.push(`  <meta property="og:image" content="${escapeHtml(imageUrl)}" />`);
        lines.push(`  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />`);
        if (meta.ogImageWidth) {
            lines.push(`  <meta property="og:image:width" content="${String(meta.ogImageWidth)}" />`);
        }
        if (meta.ogImageHeight) {
            lines.push(`  <meta property="og:image:height" content="${String(meta.ogImageHeight)}" />`);
        }
        if (meta.ogImageAlt) {
            lines.push(`  <meta property="og:image:alt" content="${escapeHtml(meta.ogImageAlt)}" />`);
        }
    }

    const twitterCard = meta.twitterCard ?? 'summary_large_image';
    lines.push(`  <meta name="twitter:card" content="${escapeHtml(twitterCard)}" />`);
    lines.push(`  <meta name="twitter:title" content="${escapeHtml(meta.title)}" />`);
    lines.push(`  <meta name="twitter:description" content="${escapeHtml(meta.description)}" />`);
    if (imageUrl) {
        lines.push(`  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`);
    }

    lines.push('  <meta name="theme-color" content="#ffffff" />');

    if (meta.jsonLd) {
        const json = JSON.stringify(meta.jsonLd, null, 2)
            .split('\n')
            .map((line) => `    ${line}`)
            .join('\n');
        lines.push('  <script type="application/ld+json">');
        lines.push(json);
        lines.push('  </script>');
    }

    return lines.join('\n');
};
