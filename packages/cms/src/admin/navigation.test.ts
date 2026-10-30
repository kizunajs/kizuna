import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSite } from './config.js';
import {
    addressOfHash,
    hrefIn,
    hrefOf,
    isCurrent,
    navigationOf,
    screenInSite,
    screenOf,
    setAdminPath,
    setSites,
    tabTitleOf,
    type Screen,
} from './navigation.js';

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

const SITES: AdminSite[] = [
    {
        key: 'group',
        label: 'Hagen Group',
        icon: 'https://hagen.example.com/icons/group.svg',
        pages: ['frontPage', 'investorsPage'],
        globals: [],
        collections: [],
    },
    {
        key: 'uk',
        label: 'Hagen UK',
        icon: 'https://hagen.example.co.uk/icons/uk.svg',
        pages: ['frontPage', 'eventsPage'],
        globals: [
            {
                name: 'settings',
                label: null,
            },
        ],
        collections: [
            {
                name: 'events',
                label: 'Events',
            },
        ],
    },
    {
        key: 'norway',
        label: 'Hagen Norge',
        icon: null,
        pages: ['frontPage'],
        globals: [],
        collections: [],
    },
];

describe('the admin navigation with several sites', () => {
    beforeEach(() => setSites(SITES));
    afterEach(() => {
        setSites([]);
        vi.unstubAllGlobals();
    });

    it("keeps shared content at the addresses of one site, and puts a site's own under its key", () => {
        const addresses: Array<[Screen, string]> = [
            [
                {
                    kind: 'document',
                    ref: 'item:offices:k3j9x2',
                },
                '/admin/collections/offices/k3j9x2',
            ],
            [
                {
                    kind: 'document',
                    ref: 'item:offices:k3j9x2',
                    site: 'uk',
                },
                '/admin/uk/collections/offices/k3j9x2',
            ],
            [
                {
                    kind: 'collection',
                    name: 'events',
                    site: 'uk',
                },
                '/admin/uk/collections/events',
            ],
            [
                {
                    kind: 'document',
                    ref: 'item:uk:events:e1',
                    site: 'uk',
                },
                '/admin/uk/collections/events/e1',
            ],
            [
                {
                    kind: 'document',
                    ref: 'global:uk:settings',
                    site: 'uk',
                },
                '/admin/uk/globals/settings',
            ],
            [
                {
                    kind: 'document',
                    ref: 'page:uk:frontPage',
                    site: 'uk',
                },
                '/admin/uk/pages/frontPage',
            ],
            [
                {
                    kind: 'pages',
                    site: 'norway',
                },
                '/admin/norway/pages',
            ],
            [
                {
                    kind: 'dashboard',
                    site: 'uk',
                },
                '/admin/uk',
            ],
            [
                {
                    kind: 'media',
                    site: 'uk',
                },
                '/admin/uk/media',
            ],
        ];
        for (const [screen, address] of addresses) {
            expect(hrefOf(screen)).toBe(address);
            expect(screenOf(address)).toEqual(screen);
        }
    });

    it("puts a site's own document under its site wherever it is linked from", () => {
        expect(
            hrefOf({
                kind: 'document',
                ref: 'item:uk:events:e1',
            })
        ).toBe('/admin/uk/collections/events/e1');
        expect(
            hrefIn(undefined, {
                kind: 'document',
                ref: 'page:norway:frontPage',
            })
        ).toBe('/admin/norway/pages/frontPage');
    });

    it('opens a link to shared content in the site open now', () => {
        vi.stubGlobal('window', {
            location: {
                pathname: '/admin/uk/collections/events',
            },
        });
        expect(
            hrefOf({
                kind: 'document',
                ref: 'item:offices:k3j9x2',
            })
        ).toBe('/admin/uk/collections/offices/k3j9x2');
        expect(
            hrefIn(undefined, {
                kind: 'document',
                ref: 'item:offices:k3j9x2',
            })
        ).toBe('/admin/collections/offices/k3j9x2');
    });

    it('reads a first segment that names no site as a screen of the shared content', () => {
        expect(screenOf('/admin/denmark/collections/offices')).toEqual({
            kind: 'missing',
        });
        expect(screenOf('/admin/uk/collections/offices/k3j9x2/more')).toEqual({
            kind: 'missing',
        });
        expect(screenOf('/admin/uk/elsewhere')).toEqual({
            kind: 'missing',
        });
    });

    it('keeps the same kind of screen when the switcher moves to another site', () => {
        const moves: Array<[Screen, string | undefined, string]> = [
            [
                {
                    kind: 'document',
                    ref: 'page:uk:frontPage',
                    site: 'uk',
                },
                'norway',
                '/admin/norway/pages/frontPage',
            ],
            [
                {
                    kind: 'document',
                    ref: 'page:uk:eventsPage',
                    site: 'uk',
                },
                'norway',
                '/admin/norway/pages',
            ],
            [
                {
                    kind: 'document',
                    ref: 'item:offices:k3j9x2',
                },
                'uk',
                '/admin/uk/collections/offices/k3j9x2',
            ],
            [
                {
                    kind: 'document',
                    ref: 'item:offices:k3j9x2',
                    site: 'uk',
                },
                undefined,
                '/admin/collections/offices/k3j9x2',
            ],
            [
                {
                    kind: 'document',
                    ref: 'item:uk:events:e1',
                    site: 'uk',
                },
                'norway',
                '/admin/norway',
            ],
            [
                {
                    kind: 'collection',
                    name: 'offices',
                    site: 'uk',
                },
                'group',
                '/admin/group/collections/offices',
            ],
            [
                {
                    kind: 'pages',
                    site: 'uk',
                },
                undefined,
                '/admin',
            ],
            [
                {
                    kind: 'media',
                },
                'norway',
                '/admin/norway/media',
            ],
        ];
        for (const [screen, site, address] of moves) expect(hrefIn(site, screenInSite(screen, site))).toBe(address);
    });

    it("lists the site's own content under its label, then the shared content under Shared, read by every site", () => {
        const sections = navigationOf({
            globals: [
                {
                    name: 'privacyPolicy',
                    label: null,
                    group: null,
                    status: 'published',
                    updatedAt: null,
                },
            ],
            collections: [
                {
                    name: 'employees',
                    label: 'Employees',
                    count: 4,
                },
                {
                    name: 'offices',
                    label: 'Offices',
                    count: 3,
                },
            ],
            groups: {
                employees: 'People',
            },
            sites: SITES,
            site: 'uk',
        });
        expect(sections.map((section) => [section.label, section.note, section.entries.map((entry) => entry.label)])).toEqual([
            ['Hagen UK', undefined, ['Pages', 'Settings', 'Events']],
            ['Shared', 'Read by every site', ['Media', 'Privacy policy', 'Employees', 'Offices']],
        ]);
        expect(sections.flatMap((section) => section.entries).map((entry) => hrefOf(entry.screen))).toEqual([
            '/admin/uk/pages',
            '/admin/uk/globals/settings',
            '/admin/uk/collections/events',
            '/admin/uk/media',
            '/admin/uk/globals/privacyPolicy',
            '/admin/uk/collections/employees',
            '/admin/uk/collections/offices',
        ]);
    });

    it('lists the shared content alone outside every site, with no pages', () => {
        const sections = navigationOf({
            globals: [],
            collections: [
                {
                    name: 'employees',
                    label: 'Employees',
                    count: 4,
                },
            ],
            groups: {
                employees: 'People',
            },
            sites: SITES,
        });
        expect(sections.map((section) => [section.label, section.entries.map((entry) => entry.label)])).toEqual([
            ['Shared', ['Media', 'Employees']],
        ]);
    });

    it("marks a site's own collection current while one of its items is open", () => {
        expect(
            isCurrent(
                {
                    kind: 'collection',
                    name: 'events',
                    site: 'uk',
                },
                screenOf('/admin/uk/collections/events/e1')
            )
        ).toBe(true);
    });
});
