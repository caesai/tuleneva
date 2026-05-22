import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { renderPageMetaHtml } from '../src/config/renderPageMetaHtml.ts';
import { LANDING_PAGE_META } from '../src/config/siteMeta.ts';

const PAGE_META_MARKER = '<!-- PAGE_META -->';
const TEMPLATE_FILE = 'index.template.html';
const OUTPUT_FILE = 'index.html';

/**
 * Подставляет SEO/OG-блок из `siteMeta.ts` в `index.html` по шаблону `index.template.html`.
 * @param rootDir - Корень проекта (cwd)
 * @returns Сгенерированный HTML
 */
export const generateIndexHtml = (rootDir: string = process.cwd()): string => {
    const templatePath = path.join(rootDir, TEMPLATE_FILE);
    const template = fs.readFileSync(templatePath, 'utf-8');

    if (!template.includes(PAGE_META_MARKER)) {
        throw new Error(
            `${TEMPLATE_FILE}: отсутствует маркер ${PAGE_META_MARKER}. Добавьте его в <head>.`,
        );
    }

    const metaHtml = renderPageMetaHtml(LANDING_PAGE_META);
    const html = template.replace(PAGE_META_MARKER, metaHtml);
    fs.writeFileSync(path.join(rootDir, OUTPUT_FILE), html, 'utf-8');

    return html;
};

/**
 * Vite-плагин: перед dev/build записывает `index.html` из шаблона и `LANDING_PAGE_META`.
 */
export const indexHtmlMetaPlugin = (): Plugin => {
    let rootDir = process.cwd();

    const runGenerate = () => {
        generateIndexHtml(rootDir);
    };

    return {
        name: 'tuleneva-index-html-meta',
        configResolved(config) {
            rootDir = config.root;
        },
        buildStart() {
            runGenerate();
        },
        configureServer() {
            runGenerate();
        },
        transformIndexHtml: {
            order: 'pre',
            handler(html) {
                if (!html.includes(PAGE_META_MARKER)) {
                    return html;
                }
                return html.replace(PAGE_META_MARKER, renderPageMetaHtml(LANDING_PAGE_META));
            },
        },
    };
};
