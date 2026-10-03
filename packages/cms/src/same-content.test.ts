import { describe, expect, it } from 'vitest';
import { sameContent } from './same-content.js';

describe('sameContent', () => {
    it('ignores the order of keys', () => {
        expect(
            sameContent(
                {
                    label: 'Read the blog',
                    href: '/blog',
                },
                {
                    href: '/blog',
                    label: 'Read the blog',
                }
            )
        ).toBe(true);
    });

    it('counts a missing key as null', () => {
        expect(
            sameContent(
                {
                    id: 'media_1',
                    alt: '',
                },
                {
                    id: 'media_1',
                    alt: '',
                    crop: undefined,
                }
            )
        ).toBe(true);
    });

    it('tells a changed value, and items in another order, apart', () => {
        expect(
            sameContent(
                {
                    id: 'media_1',
                },
                {
                    id: 'media_2',
                }
            )
        ).toBe(false);
        expect(sameContent(['prod_1', 'prod_2'], ['prod_2', 'prod_1'])).toBe(false);
    });
});
