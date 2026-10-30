import { describe, expect, it } from 'vitest';
import { addressOfHash, hrefOf, isCurrent, navigationOf, screenOf, setAdminPath, tabTitleOf, type Screen } from './navigation.js';

describe('the admin navigation', () => {
    it('reads back every screen it writes into the address', () => {
        const screens: Screen[] = [
            {
                kind: 'dashboard',
            },
            {
                kind: 'pages',
            },
            {
                kind: 'collection',
                name: 'articles',
            },
            {
                kind: 'document',
                ref: 'item:articles:a/1',
            },
            {
                kind: 'media',
            },
            {
                kind: 'media',
                id: 'med_3f2a9c1e8b7d4a5f6c0e1d2b',
            },
        ];
        for (const screen of screens) expect(screenOf(hrefOf(screen))).toEqual(screen);
    });

    it('gives each screen a path under the admin', () => {
        const addresses: Array<[Screen, string]> = [
            [
                {
                    kind: 'dashboard',
                },
                '/admin',
            ],
            [
                {
                    kind: 'document',
                    ref: 'page:frontPage',
                },
                '/admin/pages/frontPage',
            ],
            [
                {
                    kind: 'document',
                    ref: 'page:campaign:frontPage',
                },
                '/admin/pages/campaign/frontPage',
            ],
            [
                {
                    kind: 'document',
                    ref: 'global:header',
                },
                '/admin/globals/header',
            ],
            [
                {
                    kind: 'document',
                    ref: 'item:employees:k3j9x2',
                },
                '/admin/collections/employees/k3j9x2',
            ],
            [
                {
                    kind: 'record',
                    view: 'appUsers',
                    id: '42',
                },
                '/admin/views/appUsers/42',
            ],
        ];
        for (const [screen, address] of addresses) {
            expect(hrefOf(screen)).toBe(address);
            expect(screenOf(address)).toEqual(screen);
        }
    });

    it('serves its screens under any adminPath', () => {
        setAdminPath('/cms-api/editor');
        try {
            expect(
                hrefOf({
                    kind: 'collection',
                    name: 'employees',
                })
            ).toBe('/cms-api/editor/collections/employees');
            expect(screenOf('/cms-api/editor')).toEqual({
                kind: 'dashboard',
            });
        } finally {
            setAdminPath('/admin');
        }
    });

    it('names no screen for an address it does not know', () => {
        for (const address of ['/admin/login', '/admin/collections', '/admin/collections/employees/k3j9x2/more', '/elsewhere']) {
            expect(screenOf(address)).toEqual({
                kind: 'missing',
            });
        }
    });

    it('moves an address of the old hash form to its path', () => {
        expect(addressOfHash('#/collections/employees')).toBe('/admin/collections/employees');
        expect(addressOfHash(`#/edit/${encodeURIComponent('item:articles:a/1')}`)).toBe('/admin/collections/articles/a%2F1');
        expect(addressOfHash('#/views/appUsers/42')).toBe('/admin/views/appUsers/42');
        expect(addressOfHash('#/')).toBe('/admin');
        expect(addressOfHash('#field-title')).toBeUndefined();
        expect(addressOfHash('')).toBeUndefined();
    });

    it('puts pages and everything without a group under Content, then each group', () => {
        const sections = navigationOf({
            globals: [
                {
                    name: 'site',
                    label: null,
                    group: null,
                    status: 'published',
                    updatedAt: null,
                },
            ],
            collections: [
                {
                    name: 'articles',
                    label: 'Articles',
                    count: 86,
                },
                {
                    name: 'employees',
                    label: 'Employees',
                    count: 4,
                },
            ],
            groups: {
                employees: 'People',
            },
        });
        expect(sections.map((section) => [section.label, section.entries.map((entry) => entry.label)])).toEqual([
            ['Content', ['Pages', 'Media', 'Site', 'Articles']],
            ['People', ['Employees']],
        ]);
    });

    it('marks a collection current while one of its items is open', () => {
        const articles: Screen = {
            kind: 'collection',
            name: 'articles',
        };
        expect(
            isCurrent(articles, {
                kind: 'document',
                ref: 'item:articles:1',
            })
        ).toBe(true);
        expect(
            isCurrent(articles, {
                kind: 'document',
                ref: 'item:employees:1',
            })
        ).toBe(false);
    });

    it("names the tab after the screen and the site's name", () => {
        expect(tabTitleOf('Front page', 'Hagen')).toBe('Front page · Hagen');
        expect(tabTitleOf(undefined, 'Hagen')).toBe('Hagen');
        expect(tabTitleOf('Articles', undefined)).toBe('Articles · Kizuna CMS');
    });
});
