/**
 * @file HTML-блок title/meta/canonical/Open Graph.
 * Один и тот же рендер попадает в собранный index.html и в ответ Express для /music.
 */

/** Начало блока, который сервер подменяет для краулеров. */
export const PAGE_META_START = '<!-- tuleneva:page-meta -->';

/** Конец блока meta. */
export const PAGE_META_END = '<!-- /tuleneva:page-meta -->';

/** Дополнительный property/content, например music:musician. */
export interface HtmlMetaProperty {
    property: string;
    content: string;
}

/** Поля, из которых собирается head. URL уже абсолютные. */
export interface HtmlPageMeta {
    title: string;
    description: string;
    canonicalUrl: string;
    ogType?: string;
    locale?: string;
    siteName?: string;
    robots?: string;
    imageUrl?: string;
    imageWidth?: number;
    imageHeight?: number;
    imageAlt?: string;
    twitterCard?: string;
    extra?: HtmlMetaProperty[];
    jsonLd?: Record<string, unknown>;
    themeColor?: string;
}

/**
 * Экранирует текст для HTML-атрибутов и текстовых узлов.
 * @param value Исходная строка
 * @returns Строка без сырых &, ", < и >
 */
export const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

/**
 * Собирает блок head между маркерами tuleneva:page-meta.
 * @param meta Параметры страницы
 * @returns HTML-фрагмент
 */
export const renderHtmlPageMeta = (meta: HtmlPageMeta): string => {
    const lines: string[] = [PAGE_META_START];
    lines.push(`  <title>${escapeHtml(meta.title)}</title>`);
    lines.push(`  <meta name="description" content="${escapeHtml(meta.description)}" />`);

    if (meta.robots) {
        lines.push(`  <meta name="robots" content="${escapeHtml(meta.robots)}" />`);
    }

    lines.push(`  <link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}" />`);
    lines.push(`  <meta property="og:type" content="${escapeHtml(meta.ogType ?? 'website')}" />`);
    lines.push(`  <meta property="og:locale" content="${escapeHtml(meta.locale ?? 'ru_RU')}" />`);

    if (meta.siteName) {
        lines.push(`  <meta property="og:site_name" content="${escapeHtml(meta.siteName)}" />`);
    }

    lines.push(`  <meta property="og:title" content="${escapeHtml(meta.title)}" />`);
    lines.push(`  <meta property="og:description" content="${escapeHtml(meta.description)}" />`);
    lines.push(`  <meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}" />`);

    if (meta.imageUrl) {
        lines.push(`  <meta property="og:image" content="${escapeHtml(meta.imageUrl)}" />`);
        lines.push(`  <meta property="og:image:secure_url" content="${escapeHtml(meta.imageUrl)}" />`);
        if (meta.imageWidth) {
            lines.push(`  <meta property="og:image:width" content="${String(meta.imageWidth)}" />`);
        }
        if (meta.imageHeight) {
            lines.push(`  <meta property="og:image:height" content="${String(meta.imageHeight)}" />`);
        }
        if (meta.imageAlt) {
            lines.push(`  <meta property="og:image:alt" content="${escapeHtml(meta.imageAlt)}" />`);
        }
    }

    for (const item of meta.extra ?? []) {
        lines.push(`  <meta property="${escapeHtml(item.property)}" content="${escapeHtml(item.content)}" />`);
    }

    const twitterCard = meta.twitterCard ?? 'summary_large_image';
    lines.push(`  <meta name="twitter:card" content="${escapeHtml(twitterCard)}" />`);
    lines.push(`  <meta name="twitter:title" content="${escapeHtml(meta.title)}" />`);
    lines.push(`  <meta name="twitter:description" content="${escapeHtml(meta.description)}" />`);
    if (meta.imageUrl) {
        lines.push(`  <meta name="twitter:image" content="${escapeHtml(meta.imageUrl)}" />`);
    }

    lines.push(`  <meta name="theme-color" content="${escapeHtml(meta.themeColor ?? '#ffffff')}" />`);

    if (meta.jsonLd) {
        const json = JSON.stringify(meta.jsonLd, null, 2)
            .replace(/</g, '\\u003c')
            .split('\n')
            .map((line) => `    ${line}`)
            .join('\n');
        lines.push('  <script type="application/ld+json">');
        lines.push(json);
        lines.push('  </script>');
    }

    lines.push(PAGE_META_END);
    return lines.join('\n');
};

const TITLE_BLOCK = /<title>[\s\S]*?<meta name="theme-color"[^>]*>\s*(?:<script type="application\/ld\+json">[\s\S]*?<\/script>\s*)?/;

/**
 * Подменяет блок meta в index.html. Сначала ищет маркеры, иначе title…theme-color.
 * @param html Полный документ SPA
 * @param metaHtml Новый блок из renderHtmlPageMeta
 * @returns Документ с новым head и прежним body
 */
export const injectPageMeta = (html: string, metaHtml: string): string => {
    const start = html.indexOf(PAGE_META_START);
    const end = html.indexOf(PAGE_META_END);
    if (start !== -1 && end > start) {
        return `${html.slice(0, start)}${metaHtml}${html.slice(end + PAGE_META_END.length)}`;
    }
    if (TITLE_BLOCK.test(html)) {
        return html.replace(TITLE_BLOCK, `${metaHtml}\n`);
    }
    return html.replace(/<head([^>]*)>/i, `<head$1>\n${metaHtml}`);
};
