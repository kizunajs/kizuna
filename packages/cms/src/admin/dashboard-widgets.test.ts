import { describe, expect, it } from 'vitest';
import {
    askedOf,
    changeOf,
    groupsOf,
    isNewOf,
    periodOfSearch,
    rangeOf,
    refreshWordsOf,
    reviewGroupsOf,
    roleOf,
    runsOf,
    sharedScaleOf,
    tileColumnsOf,
    type DashboardCollection,
    type DashboardWidgetBody,
    type SiteColumn,
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
            sites: [],
        };
        expect(runsOf([revenue, sites, ordersPerDay]).map((run) => run.kind)).toEqual(['stats', 'sites', 'panels']);
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

    it("puts every site's chart on one scale", () => {
        const column = (key: string, values: number[]): SiteColumn => ({
            ...uk,
            key,
            url: 'https://hagen.example.co.uk',
            stats: [],
            chart: values.map((value) => ({
                label: 'Mon',
                value,
            })),
            waiting: 0,
            lastPublish: null,
            lastRefresh: null,
        });
        expect(sharedScaleOf([column('uk', [400, 600]), column('norway', [300])])).toEqual([400, 600, 300]);
    });
});
