import { describe, expect, it } from 'vitest';
import { LANDING_PAGE_META, SITE_ORIGIN, toAbsoluteUrl } from '@/config/siteMeta.ts';

describe('siteMeta', () => {
    it('toAbsoluteUrl builds production URLs', () => {
        expect(toAbsoluteUrl('/og-image.jpg')).toBe(`${SITE_ORIGIN}/og-image.jpg`);
        expect(toAbsoluteUrl('https://example.com/x')).toBe('https://example.com/x');
    });

    it('LANDING_PAGE_META has canonical and og image', () => {
        expect(LANDING_PAGE_META.canonicalPath).toBe('/');
        expect(LANDING_PAGE_META.ogImagePath).toBe('/og-image.jpg');
        expect(LANDING_PAGE_META.jsonLd?.url).toBe(SITE_ORIGIN);
    });
});
