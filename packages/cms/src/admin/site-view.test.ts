import { describe, expect, it } from 'vitest';
import { isShared, ownValueCount, setsOwnValue, sharedNameOf, siteValuesRefOf } from './site-view.js';

describe("a site's values on shared content", () => {
    it('tells shared content from a page or a site of its own', () => {
        expect(isShared('item:offices:k3j9x2')).toBe(true);
        expect(isShared('global:privacyPolicy')).toBe(true);
        expect(isShared('item:uk:events:e1')).toBe(false);
        expect(isShared('page:uk:frontPage')).toBe(false);
        expect(sharedNameOf('item:offices:k3j9x2')).toBe('offices');
        expect(sharedNameOf('global:privacyPolicy')).toBe('privacyPolicy');
        expect(sharedNameOf('item:uk:events:e1')).toBeUndefined();
    });

    it('keeps them where the CMS stores them, under the site', () => {
        expect(siteValuesRefOf('item:offices:k3j9x2', 'uk')).toBe('item:uk:offices:k3j9x2');
        expect(siteValuesRefOf('global:privacyPolicy', 'uk')).toBe('global:uk:privacyPolicy');
    });

    it('counts the values a site sets itself, leaving out the ones it leaves empty', () => {
        const values = {
            phone: '+44 20 7946 0321',
            openingHours: '',
            photos: [],
            notes: null,
        };
        expect(ownValueCount(values)).toBe(1);
        expect(ownValueCount(null)).toBe(0);
        expect(setsOwnValue(values, 'phone')).toBe(true);
        expect(setsOwnValue(values, 'openingHours')).toBe(false);
    });
});
