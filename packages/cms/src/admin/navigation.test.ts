import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    showSite,
    siteGroupsOf,
    siteMarksOf,
    ALL_PLACE,
    SHARED_PLACE,
    placeOf,
    screenInPlace,
    sitePlace,
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
        showSite(undefined);
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

    it('opens a link to shared content in the site the admin is shown in', () => {
        showSite('uk');
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
        showSite(undefined);
        expect(
            hrefOf({
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
                    kind: 'document',
                    ref: 'item:uk:events:e1',
                    site: 'uk',
                },
                undefined,
                '/admin/uk/collections/events/e1',
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
                '/admin/pages',
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

    const LISTED = {
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
    };

    it("lists a site's own kinds, flat, under it", () => {
        const sections = navigationOf({
            ...LISTED,
            place: sitePlace('uk'),
        });
        expect(sections.flatMap((section) => section.entries).map((entry) => [entry.label, hrefOf(entry.screen)])).toEqual([
            ['Pages', '/admin/uk/pages'],
            ['Events', '/admin/uk/collections/events'],
            ['Settings', '/admin/uk/globals/settings'],
            ['Waiting', '/admin/uk/waiting'],
            ['Media', '/admin/uk/media'],
        ]);
    });

    it('lists the shared collections, globals and media under Shared', () => {
        const sections = navigationOf({
            ...LISTED,
            place: SHARED_PLACE,
        });
        expect(sections.flatMap((section) => section.entries).map((entry) => [entry.label, hrefOf(entry.screen)])).toEqual([
            ['Employees', '/admin/collections/employees'],
            ['Offices', '/admin/collections/offices'],
            ['Privacy policy', '/admin/globals/privacyPolicy'],
            ['Media', '/admin/media'],
        ]);
    });

    it('reads the place from the address alone: shared content is Shared, anything of one site that site', () => {
        expect(placeOf(screenOf('/admin/collections/offices/k3j9x2'), true)).toEqual(SHARED_PLACE);
        expect(placeOf(screenOf('/admin/uk/collections/offices/k3j9x2'), true)).toEqual(SHARED_PLACE);
        expect(placeOf(screenOf('/admin/media'), true)).toEqual(SHARED_PLACE);
        expect(placeOf(screenOf('/admin/norway/pages/frontPage'), true)).toEqual(sitePlace('norway'));
        expect(placeOf(screenOf('/admin/uk/collections/events/e1'), true)).toEqual(sitePlace('uk'));
        expect(placeOf(screenOf('/admin/group'), true)).toEqual(sitePlace('group'));
        expect(placeOf(screenOf('/admin/uk/media'), true)).toEqual(sitePlace('uk'));
        expect(placeOf(screenOf('/admin'), true)).toEqual(ALL_PLACE);
        expect(placeOf(screenOf('/admin/pages'), true)).toEqual(ALL_PLACE);
        expect(placeOf(screenOf('/admin/collections/events'), true)).toEqual(ALL_PLACE);
        expect(placeOf(screenOf('/admin'), false)).toEqual(sitePlace('group'));
    });

    it('opens the same kind of screen in another place, where it has one', () => {
        expect(hrefOf(screenInPlace(screenOf('/admin/uk/pages'), ALL_PLACE))).toBe('/admin');
        expect(hrefOf(screenInPlace(screenOf('/admin/uk/pages/frontPage'), sitePlace('norway')))).toBe('/admin/norway/pages/frontPage');
        expect(hrefOf(screenInPlace(screenOf('/admin/collections/offices'), sitePlace('uk')))).toBe('/admin/uk');
        expect(hrefOf(screenInPlace(screenOf('/admin/uk/collections/events'), SHARED_PLACE))).toBe('/admin/media');
    });

    it("marks a site's pages current on its own pages alone", () => {
        const ukPages: Screen = {
            kind: 'pages',
            site: 'uk',
        };
        expect(isCurrent(ukPages, screenOf('/admin/uk/pages/frontPage'))).toBe(true);
        expect(isCurrent(ukPages, screenOf('/admin/norway/pages'))).toBe(false);
        expect(isCurrent(ukPages, screenOf('/admin/pages'))).toBe(false);
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

    it('lists a few sites as they are, and many with a search, grouped by the country each serves', () => {
        expect(siteGroupsOf(SITES, '')).toEqual([
            {
                country: undefined,
                sites: SITES,
            },
        ]);
        const dealers: AdminSite[] = ['Bergen', 'Oslo', 'Malmö', 'Aarhus', 'Tromsø', 'Lund'].map((city) => ({
            key: city.toLowerCase(),
            label: `Hagen ${city}`,
            icon: null,
            country: ['Malmö', 'Lund'].includes(city) ? 'SE' : city === 'Aarhus' ? 'DK' : 'NO',
            pages: [],
            globals: [],
            collections: [],
        }));
        const many = [...SITES, ...dealers];
        expect(siteGroupsOf(many, '').map((group) => [group.country, group.sites.map((site) => site.key)])).toEqual([
            [undefined, ['group', 'uk', 'norway']],
            ['NO', ['bergen', 'oslo', 'tromsø']],
            ['SE', ['malmö', 'lund']],
            ['DK', ['aarhus']],
        ]);
        expect(siteGroupsOf(many, 'hagen o').map((group) => [group.country, group.sites.map((site) => site.key)])).toEqual([
            ['NO', ['oslo']],
        ]);
    });

    it('marks a site with its own icon, or with a code when another site shares the icon', () => {
        const dealer = (key: string, label: string, code?: string): AdminSite => ({
            key,
            label,
            icon: 'https://hagen.example.no/icon.svg',
            pages: [],
            globals: [],
            collections: [],
            ...(code === undefined
                ? {}
                : {
                      code,
                  }),
        });
        const marks = siteMarksOf([
            {
                ...dealer('uk', 'Hagen UK'),
                icon: 'https://hagen.example.co.uk/icon.svg',
            },
            dealer('bergen-sentrum', 'Hagen Bergen Sentrum'),
            dealer('bergen-asane', 'Hagen Bergen Åsane'),
            dealer('trondheim', 'Hagen Trondheim'),
            dealer('tromso', 'Hagen Tromsø'),
            dealer('malmo', 'Hagen Malmö', 'MLM'),
        ]);
        expect(Object.fromEntries(marks)).toEqual({
            uk: {
                icon: 'https://hagen.example.co.uk/icon.svg',
            },
            'bergen-sentrum': {
                code: 'BS',
            },
            'bergen-asane': {
                code: 'BÅ',
            },
            trondheim: {
                code: 'TRO',
            },
            tromso: {
                code: 'TRØ',
            },
            malmo: {
                code: 'MLM',
            },
        });
    });

    it("gives Overview's Waiting, Sites and People addresses of their own, and a site its Waiting", () => {
        const addresses: Array<[Screen, string]> = [
            [
                {
                    kind: 'waiting',
                },
                '/admin/waiting',
            ],
            [
                {
                    kind: 'waiting',
                    site: 'uk',
                },
                '/admin/uk/waiting',
            ],
            [
                {
                    kind: 'sites',
                },
                '/admin/sites',
            ],
            [
                {
                    kind: 'sites',
                    key: 'norway',
                },
                '/admin/sites/norway',
            ],
            [
                {
                    kind: 'people',
                },
                '/admin/people',
            ],
        ];
        for (const [screen, address] of addresses) {
            expect(hrefOf(screen)).toBe(address);
            expect(screenOf(address)).toEqual(screen);
        }
        expect(placeOf(screenOf('/admin/waiting'), true)).toEqual(ALL_PLACE);
        expect(placeOf(screenOf('/admin/sites/norway'), true)).toEqual(ALL_PLACE);
        expect(placeOf(screenOf('/admin/uk/waiting'), true)).toEqual(sitePlace('uk'));
    });

    it('lists Waiting, Sites and People in Overview, and Waiting in a site', () => {
        expect(
            navigationOf({
                ...LISTED,
                place: ALL_PLACE,
            })
                .flatMap((section) => section.entries)
                .map((entry) => entry.label)
        ).toEqual(['Waiting', 'Sites', 'People']);
        expect(
            navigationOf({
                ...LISTED,
                place: sitePlace('uk'),
            })
                .flatMap((section) => section.entries)
                .map((entry) => [entry.label, hrefOf(entry.screen)])
        ).toContainEqual(['Waiting', '/admin/uk/waiting']);
    });

    it('keeps Waiting when the switcher moves between Overview and a site', () => {
        expect(hrefOf(screenInPlace(screenOf('/admin/waiting'), sitePlace('uk')))).toBe('/admin/uk/waiting');
        expect(hrefOf(screenInPlace(screenOf('/admin/uk/waiting'), ALL_PLACE))).toBe('/admin/waiting');
        expect(hrefOf(screenInPlace(screenOf('/admin/sites/norway'), sitePlace('uk')))).toBe('/admin/uk');
    });
});
