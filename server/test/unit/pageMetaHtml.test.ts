/**
 * @file Подмена head: экранирование и повторное чтение index.html.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { injectPageMeta, renderHtmlPageMeta } from '../../../shared/pageMetaHtml';
import { clearIndexHtmlCache, readIndexHtml } from '../../seo/musicHtml';

describe('page meta html', () => {
    it('escapes title and description inside the marker block', () => {
        const source = [
            '<head>',
            '<!-- tuleneva:page-meta -->',
            '<title>old</title>',
            '<!-- /tuleneva:page-meta -->',
            '</head>',
            '<body><div id="root"></div></body>',
        ].join('');
        const html = injectPageMeta(source, renderHtmlPageMeta({
            title: 'A & B <script>alert(1)</script>',
            description: 'say "hi"',
            canonicalUrl: 'https://test.example/music/album/1',
            ogType: 'music.album',
            imageUrl: 'https://test.example/cover.jpg',
            imageWidth: 1200,
            imageHeight: 630,
            extra: [{ property: 'music:musician', content: 'A & B' }],
        }));

        expect(html).toContain('A &amp; B &lt;script&gt;alert(1)&lt;/script&gt;');
        expect(html).toContain('say &quot;hi&quot;');
        expect(html).toContain('content="music.album"');
        expect(html).toContain('property="music:musician" content="A &amp; B"');
        expect(html).toContain('<div id="root"></div>');
        expect(html).not.toContain('<script>alert');
    });

    it('replaces a title block when markers are missing', () => {
        const source = [
            '<head><title>old</title>',
            '<meta name="theme-color" content="#ffffff" />',
            '<script type="application/ld+json">{"name":"old"}</script>',
            '</head><body>spa</body>',
        ].join('');
        const html = injectPageMeta(source, renderHtmlPageMeta({
            title: 'Новая',
            description: 'описание',
            canonicalUrl: 'https://test.example/music',
        }));

        expect(html).toContain('<title>Новая</title>');
        expect(html).not.toContain('<title>old</title>');
        expect(html).not.toContain('"name":"old"');
        expect(html).toContain('<body>spa</body>');
    });

    it('re-reads index.html after mtime changes', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuleneva-og-'));
        const file = path.join(dir, 'index.html');
        const block = (title: string) => `<title>${title}</title><meta name="theme-color" content="#ffffff" />`;
        fs.writeFileSync(file, block('one'));
        clearIndexHtmlCache();
        expect(readIndexHtml(file)).toContain('one');
        fs.writeFileSync(file, block('two'));
        const later = new Date(Date.now() + 5000);
        fs.utimesSync(file, later, later);
        expect(readIndexHtml(file)).toContain('two');
        expect(readIndexHtml(file)).not.toContain('<title>one</title>');
    });
});
