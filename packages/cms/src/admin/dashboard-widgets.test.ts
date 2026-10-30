import { describe, expect, it } from 'vitest';
import {
    askedOf,
    barShareOf,
    changeColumnsOf,
    changeOf,
    collectionSectionsOf,
    countryNameOf,
    funnelRowsOf,
    groupsOf,
    isNewOf,
    periodOfSearch,
    rangeOf,
    refreshWordsOf,
    reviewGroupsOf,
    roleOf,
    runsOf,
    siteRowsOf,
    tileColumnsOf,
    type DashboardCollection,
    type DashboardWidgetBody,
    type SiteRow,
} from './dashboard-widgets.js';

const revenue: DashboardWidgetBody = {
    type: 'stat',
    label: 'Revenue this week',
    value: '48 290 kr',
};

const orders: DashboardWidgetBody = {
    type: 'stat',
    label: 'Orders this week',
    value: '132',
};

const ordersPerDay: DashboardWidgetBody = {
    type: 'chart',
    label: 'Orders per day',
    style: 'bar',
    data: [],
};

const reviews: DashboardWidgetBody = {
    type: 'reviews',
    reviews: [],
};

const collections: DashboardWidgetBody = {
    type: 'collections',
    collections: [],
};

describe('the dashboard rows', () => {
    it('puts neighbouring stats in one row of tiles, and a chart beside the reviews', () => {
        expect(runsOf([revenue, orders, ordersPerDay, reviews, collections])).toEqual([
            {
                kind: 'stats',
                widgets: [revenue, orders],
            },
            {
                kind: 'panels',
                widgets: [ordersPerDay, reviews],
            },
            {
                kind: 'collections',
                widget: collections,
            },
        ]);
    });

    it('keeps the order listed, starting a new row when another kind comes between', () => {
        expect(runsOf([revenue, reviews, orders]).map((run) => run.kind)).toEqual(['stats', 'panels', 'stats']);
    });
});

describe('the collection groups', () => {
    const collection = (name: string, group: string | null): DashboardCollection => ({
        kind: 'collection',
        name,
        label: name,
        group,
        count: 0,
    });

    it('lists Content first, then each group in the order first named', () => {
        const grouped = groupsOf([collection('orders', 'Shop'), collection('articles', null), collection('products', 'Shop')]);
        expect(
            grouped.map((group) => ({
                label: group.label,
                names: group.collections.map((member) => member.name),
            }))
        ).toEqual([
            {
                label: 'Content',
                names: ['articles'],
            },
            {
                label: 'Shop',
                names: ['orders', 'products'],
            },
        ]);
    });

    it('leaves out Content when nothing sits under it', () => {
        expect(groupsOf([collection('orders', 'Shop')]).map((group) => group.label)).toEqual(['Shop']);
    });
});

describe('changeOf', () => {
    it('shows a rise with an up arrow and one decimal', () => {
        expect(changeOf(0.081)).toEqual({
            text: '↑ 8.1%',
            spoken: 'Up 8.1%',
            direction: 'up',
        });
    });

    it('shows a fall with a down arrow, dropping a trailing zero', () => {
        expect(changeOf(-0.02)).toEqual({
            text: '↓ 2%',
            spoken: 'Down 2%',
            direction: 'down',
        });
    });

    it('shows no arrow for a change that rounds to nothing', () => {
        expect(changeOf(0.0004)).toEqual({
            text: '0%',
            spoken: 'No change',
            direction: 'none',
        });
    });
});

describe('tileColumnsOf', () => {
    it('gives each of up to four tiles a column', () => {
        expect([1, 2, 3, 4].map(tileColumnsOf)).toEqual([1, 2, 3, 4]);
    });

    it('fills the rows evenly beyond four', () => {
        expect([5, 6, 7, 8, 9].map(tileColumnsOf)).toEqual([3, 3, 4, 4, 3]);
    });

    it('keeps four columns when there are no tiles', () => {
        expect(tileColumnsOf(0)).toBe(4);
    });
});

describe('the dashboard period', () => {
    it('reads the period the address names', () => {
        expect(periodOfSearch('?period=30d')).toBe('30d');
        expect(periodOfSearch('?period=24h')).toBe('24h');
    });

    it('opens on the last 7 days without one, or with one it does not know', () => {
        expect(periodOfSearch('')).toBe('7d');
        expect(periodOfSearch('?page=2')).toBe('7d');
        expect(periodOfSearch('?period=1y')).toBe('7d');
    });

    it('names a week by its first and last day', () => {
        expect(
            rangeOf(
                {
                    from: '2026-10-21T12:00:00.000Z',
                    to: '2026-10-28T12:00:00.000Z',
                },
                'en-GB',
                new Date('2026-10-28T12:00:00.000Z')
            )
        ).toBe('21 Oct to 28 Oct');
    });

    it('adds the year once the range is not this one', () => {
        expect(
            rangeOf(
                {
                    from: '2026-12-01T12:00:00.000Z',
                    to: '2026-12-31T12:00:00.000Z',
                },
                'en-GB',
                new Date('2027-01-02T12:00:00.000Z')
            )
        ).toBe('1 Dec 2026 to 31 Dec 2026');
    });

    it('names the hour for the last 24 hours', () => {
        expect(
            rangeOf(
                {
                    from: '2026-10-27T12:00:00.000Z',
                    to: '2026-10-28T12:00:00.000Z',
                },
                'en-GB',
                new Date('2026-10-28T12:00:00.000Z')
            )
        ).toMatch(/^27 Oct.*\d\d:\d\d to 28 Oct.*\d\d:\d\d$/);
    });
});

describe('askedOf', () => {
    const now = new Date('2026-10-28T12:00:00.000Z');

    it('names who asked and how long ago', () => {
        expect(
            askedOf(
                {
                    ref: 'item:articles:1',
                    label: 'How often to water a fiddle leaf fig',
                    requestedBy: {
                        name: 'Ingrid Haugen',
                    },
                    createdAt: '2026-10-28T10:00:00.000Z',
                },
                now
            )
        ).toBe('Ingrid Haugen asked 2 hours ago');
    });

    it('adds the time to yesterday', () => {
        expect(
            askedOf(
                {
                    ref: 'page:contact',
                    label: 'Contact',
                    requestedBy: {
                        name: 'Felix Lund',
                    },
                    createdAt: '2026-10-27T10:20:00.000Z',
                },
                now
            )
        ).toMatch(/^Felix Lund asked yesterday at \d\d:\d\d$/);
    });

    it('says nothing without who asked', () => {
        expect(
            askedOf(
                {
                    ref: 'page:contact',
                    label: 'Contact',
                },
                now
            )
        ).toBeUndefined();
    });
});

describe('isNewOf', () => {
    it('is new with only collections and no review waiting', () => {
        expect(
            isNewOf([
                {
                    type: 'reviews',
                    reviews: [],
                },
                {
                    type: 'collections',
                    collections: [],
                },
            ])
        ).toBe(true);
    });

    it('is not new once there is a number or a review waiting', () => {
        expect(isNewOf([revenue])).toBe(false);
        expect(
            isNewOf([
                {
                    type: 'reviews',
                    reviews: [
                        {
                            ref: 'page:contact',
                            label: 'Contact',
                        },
                    ],
                },
            ])
        ).toBe(false);
    });
});

const uk = {
    key: 'uk',
    label: 'Hagen UK',
    icon: null,
};

const norway = {
    key: 'norway',
    label: 'Hagen Norge',
    icon: null,
};

describe('the overview', () => {
    it('gives the sites widget a row of its own', () => {
        const sites: DashboardWidgetBody = {
            type: 'sites',
            chart: null,
            stats: [],
            sites: [],
            countries: null,
        };
        expect(runsOf([revenue, sites, ordersPerDay]).map((run) => run.kind)).toEqual(['stats', 'sites', 'panels']);
    });

    it('puts the reviews waiting among the stat tiles', () => {
        const waiting: DashboardWidgetBody = {
            type: 'waiting',
            count: 2,
            sites: [uk],
        };
        expect(runsOf([revenue, waiting, ordersPerDay]).map((run) => [run.kind, 'widgets' in run ? run.widgets.length : 1])).toEqual([
            ['stats', 2],
            ['panels', 1],
        ]);
    });

    it('groups the reviews by site, the shared ones first, leaving out a site nothing waits on', () => {
        const groups = reviewGroupsOf(
            [
                {
                    ref: 'page:uk:frontPage',
                    label: 'Front page',
                },
                {
                    ref: 'item:offices:london',
                    label: 'Hagen London',
                },
            ],
            [uk, norway]
        );
        expect(groups.map((group) => [group.site?.key, group.reviews.map((review) => review.label)])).toEqual([
            [undefined, ['Hagen London']],
            ['uk', ['Front page']],
        ]);
    });

    it("names an editor's role over every site, on a site, or their own", () => {
        expect(
            roleOf({
                roles: ['admin'],
                sites: [],
            })
        ).toBe('Admin over every site');
        expect(
            roleOf({
                roles: ['editor'],
                sites: [
                    {
                        label: 'Hagen UK',
                        roles: ['editor'],
                    },
                ],
            })
        ).toBe('Editor on Hagen UK');
        expect(
            roleOf({
                roles: ['editor'],
                sites: [],
            })
        ).toBe('Editor');
    });

    it('says whether a refresh answered, and which try a failing one is on', () => {
        const at = new Date(2026, 9, 30, 9, 42).toISOString();
        expect(
            refreshWordsOf({
                status: 'answered',
                at,
                attempts: 1,
            })
        ).toEqual({
            text: 'Answered at 09:42',
            wrong: false,
        });
        expect(
            refreshWordsOf({
                status: 'retrying',
                at,
                attempts: 3,
            })
        ).toEqual({
            text: 'Did not answer',
            detail: 'Retrying, 3rd try at 09:42',
            wrong: true,
        });
    });

    it('lists the sites in the order sent until they group by country', () => {
        const row = (key: string, country: string | null): SiteRow => ({
            ...uk,
            key,
            url: 'https://hagen.example.co.uk',
            country,
            stats: [],
            chart: null,
        });
        const sites = [row('group', null), row('london', 'GB'), row('oslo', 'NO'), row('leeds', 'GB')];
        expect(
            siteRowsOf({
                sites,
                countries: null,
            }).map((entry) => (entry.kind === 'site' ? entry.site.key : entry.label))
        ).toEqual(['group', 'london', 'oslo', 'leeds']);
        const grouped = siteRowsOf({
            sites,
            countries: [
                {
                    country: 'GB',
                    sites: ['london', 'leeds'],
                    stats: [
                        {
                            value: '5,000',
                        },
                    ],
                },
                {
                    country: null,
                    sites: ['group'],
                    stats: [],
                },
                {
                    country: 'NO',
                    sites: ['oslo'],
                    stats: [],
                },
            ],
        });
        expect(grouped.map((entry) => (entry.kind === 'site' ? entry.site.key : `${entry.label} · ${entry.count}`))).toEqual([
            'group',
            'United Kingdom · 2',
            'london',
            'leeds',
            'Norway · 1',
            'oslo',
        ]);
        expect(grouped[1]).toMatchObject({
            stats: [
                {
                    value: '5,000',
                },
            ],
        });
    });

    it('gives a change column only to a stat that has a change', () => {
        expect(
            changeColumnsOf({
                stats: [
                    {
                        label: 'Visitors',
                    },
                    {
                        label: 'Revenue',
                    },
                ],
                sites: [
                    {
                        ...uk,
                        url: 'https://hagen.example.co.uk',
                        country: 'GB',
                        stats: [
                            {
                                value: '22,258',
                                change: 0.128,
                            },
                            {
                                value: '244 571 kr',
                            },
                        ],
                        chart: null,
                    },
                ],
            })
        ).toEqual([true, false]);
    });

    it('names a country from its code', () => {
        expect(countryNameOf('NO')).toBe('Norway');
        expect(countryNameOf('not a country')).toBe('not a country');
    });
});

describe('lists and funnels', () => {
    it("fills a row's bar to the list's largest value, or to its own whole", () => {
        const rows = [
            {
                value: 6120,
            },
            {
                value: 3060,
            },
        ];
        expect(barShareOf(rows[1]!, rows)).toBe(0.5);
        expect(
            barShareOf(
                {
                    value: 9,
                    of: 12,
                },
                rows
            )
        ).toBe(0.75);
        expect(
            barShareOf(
                {
                    value: 0,
                },
                rows
            )
        ).toBe(0);
    });

    it('sizes each step by the first, and says how much of the step before went on', () => {
        expect(
            funnelRowsOf([
                {
                    label: 'Visit',
                    value: 1000,
                },
                {
                    label: 'Cart',
                    value: 250,
                },
                {
                    label: 'Paid',
                    value: 100,
                },
            ])
        ).toEqual([
            {
                label: 'Visit',
                value: 1000,
                share: 1,
                kept: undefined,
            },
            {
                label: 'Cart',
                value: 250,
                share: 0.25,
                kept: '25%',
            },
            {
                label: 'Paid',
                value: 100,
                share: 0.1,
                kept: '40%',
            },
        ]);
    });
});

describe('the collection sections', () => {
    const collection = (name: string, site: DashboardCollection['site']): DashboardCollection => ({
        kind: 'collection',
        name,
        label: name,
        group: null,
        count: 0,
        site,
    });

    it("puts a site's own collections under its label, then the shared ones once", () => {
        const sections = collectionSectionsOf(
            [
                collection('events', {
                    key: 'uk',
                    label: 'Hagen UK',
                }),
                collection('employees', null),
                collection('offices', null),
            ],
            'Shared'
        );
        expect(sections.map((section) => [section.heading, section.collections.map((entry) => entry.name)])).toEqual([
            ['Hagen UK', ['events']],
            ['Shared', ['employees', 'offices']],
        ]);
    });

    it('lists them under Shared alone on a site with none of its own', () => {
        expect(collectionSectionsOf([collection('employees', null)], 'Shared').map((section) => section.heading)).toEqual(['Shared']);
    });

    it('lists them under Collections without sites', () => {
        expect(collectionSectionsOf([collection('employees', undefined)], 'Shared').map((section) => section.heading)).toEqual([
            'Collections',
        ]);
    });
});
