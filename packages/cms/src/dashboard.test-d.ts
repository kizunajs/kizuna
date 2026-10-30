import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { declareSites, SiteSchema } from './site.js';
import { cms } from './provider.js';
import type { CmsDatabase } from './storage/store.js';
import type { DashboardContext, OverviewContext } from './dashboard.js';

const Site = SiteSchema.extend({
    companyName: z.string(),
});

const sites = declareSites(Site, {
    uk: {
        label: 'Hagen UK',
        url: 'https://hagen.example.co.uk',
        icon: '/icons/uk.svg',
        companyName: 'Hagen UK Ltd',
    },
    norway: {
        label: 'Hagen Norge',
        url: 'https://hagen.example.no',
        icon: '/icons/norway.svg',
        companyName: 'Hagen Norge AS',
    },
});

declare const db: CmsDatabase;

const visits = ({ site }: DashboardContext<typeof sites>) => site.key.length;

const visitsAcrossSites = ({ sites: shown }: OverviewContext<typeof sites>) => shown.length;

const topPages = ({ site }: DashboardContext<typeof sites>) => [
    {
        label: 'Front page',
        site: site.key,
        value: 6120,
    },
];

describe('dashboard functions', () => {
    it('receive the site they count for, with its fields', () => {
        expectTypeOf<DashboardContext<typeof sites>['site']['key']>().toEqualTypeOf<'uk' | 'norway'>();
        expectTypeOf<DashboardContext<typeof sites>['site']['companyName']>().toEqualTypeOf<string>();
        expectTypeOf<OverviewContext<typeof sites>['sites'][number]['key']>().toEqualTypeOf<'uk' | 'norway'>();
    });

    it('receive no site without sites', () => {
        expectTypeOf<DashboardContext['site']>().toEqualTypeOf<undefined>();
    });

    it('name only declared sites', () => {
        cms({
            db,
            sites,
            auth: {
                identity: 'editor',
            },
            dashboard: [
                {
                    type: 'stat',
                    label: 'Visits',
                    value: visits,
                    sites: ['uk'],
                },
                {
                    type: 'list',
                    label: 'Top pages',
                    data: topPages,
                    columns: {
                        label: 'Page',
                        value: 'Visitors',
                    },
                },
                {
                    type: 'funnel',
                    label: 'Checkout',
                    data: () => [
                        {
                            label: 'Visit',
                            value: 1000,
                        },
                    ],
                    sites: ['norway'],
                },
                {
                    type: 'waiting',
                    sites: ['uk'],
                },
            ],
            overview: [
                {
                    type: 'stat',
                    label: 'Visits',
                    value: visitsAcrossSites,
                },
                {
                    type: 'sites',
                    stats: [
                        {
                            label: 'Visits',
                            value: visits,
                            total: visitsAcrossSites,
                        },
                    ],
                    chart: {
                        label: 'Week',
                        data: () => [],
                    },
                },
                {
                    type: 'waiting',
                },
            ],
        });
        cms({
            db,
            sites,
            auth: {
                identity: 'editor',
            },
            dashboard: [
                {
                    type: 'stat',
                    label: 'Visits',
                    value: visits,
                    // @ts-expect-error sweden is not declared
                    sites: ['sweden'],
                },
                {
                    type: 'waiting',
                    // @ts-expect-error sweden is not declared
                    sites: ['sweden'],
                },
            ],
            overview: [
                {
                    type: 'sites',
                    stats: [
                        {
                            label: 'Visits',
                            value: visits,
                            // @ts-expect-error a total receives every site, not one
                            total: visits,
                        },
                    ],
                },
            ],
        });
    });
});
