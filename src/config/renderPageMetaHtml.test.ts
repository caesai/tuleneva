import { describe, expect, it } from 'vitest';
import { renderPageMetaHtml } from '@/config/renderPageMetaHtml.ts';
import { LANDING_PAGE_META, SITE_ORIGIN } from '@/config/siteMeta.ts';

describe('renderPageMetaHtml', () => {
    it('includes title, og:image and canonical', () => {
        const html = renderPageMetaHtml(LANDING_PAGE_META);

        expect(html).toContain('<title>');
        expect(html).toContain(LANDING_PAGE_META.title);
        expect(html).toContain(`href="${SITE_ORIGIN}/"`);
        expect(html).toContain(`${SITE_ORIGIN}/og-image.jpg`);
        expect(html).toContain('property="og:title"');
        expect(html).toContain('application/ld+json');
    });

    it('escapes special characters in description', () => {
        const html = renderPageMetaHtml({
            title: 'Test',
            description: 'A & B < "quotes"',
        });

        expect(html).toContain('A &amp; B &lt; &quot;quotes&quot;');
        expect(html).not.toContain('A & B <');
    });
});
