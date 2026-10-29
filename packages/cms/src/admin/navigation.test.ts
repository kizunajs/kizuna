import { describe, expect, it } from 'vitest';
import { hrefOf, isCurrent, navigationOf, screenOf, tabTitleOf, type Screen } from './navigation.js';

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
        expect(screenOf('')).toEqual({
            kind: 'dashboard',
        });
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
