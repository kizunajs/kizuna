import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { declareSites, SiteSchema } from './site.js';
import type { CmsContent } from './reader.js';
import type { DocumentRef } from './refs.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { definePage } from './page.js';
import { definePages } from './options.js';
import { Kizuna } from 'kizunajs';

const Site = SiteSchema.extend({
    companyName: z.string(),
});

describe('declareSites', () => {
    it('keeps each site by its name, with the fields its schema reads', () => {
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
                locales: ['nb'],
                companyName: 'Hagen Norge AS',
            },
        });
        expectTypeOf<keyof typeof sites.values>().toEqualTypeOf<'uk' | 'norway'>();
        expectTypeOf(sites.values.uk.companyName).toEqualTypeOf<string>();
        expectTypeOf(sites.values.uk.locales).toEqualTypeOf<string[] | undefined>();
    });

    it('needs the fields the schema declares', () => {
        declareSites(Site, {
            // @ts-expect-error companyName is missing
            uk: {
                label: 'Hagen UK',
                url: 'https://hagen.example.co.uk',
                icon: '/icons/uk.svg',
            },
        });
        declareSites(Site, {
            uk: {
                label: 'Hagen UK',
                url: 'https://hagen.example.co.uk',
                icon: '/icons/uk.svg',
                // @ts-expect-error companyName is text
                companyName: 3,
            },
        });
    });

    it('takes only a schema built on SiteSchema', () => {
        declareSites(
            // @ts-expect-error the schema lacks label, url and icon
            z.object({
                companyName: z.string(),
            }),
            {
                uk: {
                    companyName: 'Hagen UK Ltd',
                },
            }
        );
    });

    it('reads the current site with its key typed as the declared names', () => {
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
        type Content = CmsContent<{}, readonly [], readonly [], typeof sites>;
        type Current = Awaited<ReturnType<Content['site']['get']>>;
        expectTypeOf<Current['key']>().toEqualTypeOf<'uk' | 'norway'>();
        expectTypeOf<Current['companyName']>().toEqualTypeOf<string>();
        expectTypeOf<Current['status']>().toEqualTypeOf<'live' | 'offline' | undefined>();
        expectTypeOf<CmsContent<{}, readonly [], readonly [], undefined>>().not.toHaveProperty('site');
    });

    it('lets a global or an item name the site it belongs to', () => {
        expectTypeOf<Extract<DocumentRef, { type: 'global' }>['site']>().toEqualTypeOf<string | undefined>();
        expectTypeOf<Extract<DocumentRef, { type: 'item' }>['site']>().toEqualTypeOf<string | undefined>();
    });
});

const Offices = defineCollection({
    name: 'offices',
    id: Kizuna.brand('OfficeId', z.string()),
    fields: [
        {
            name: 'city',
            schema: z.string(),
        },
    ],
});

const Events = defineCollection({
    name: 'events',
    id: Kizuna.brand('EventId', z.string()),
    fields: [
        {
            name: 'title',
            schema: z.string(),
        },
    ],
});

const PrivacyPolicy = defineGlobal({
    name: 'privacyPolicy',
    fields: [
        {
            name: 'text',
            schema: z.string(),
        },
    ],
});

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});

const AboutPage = definePage({
    name: 'aboutPage',
    fields: [
        {
            name: 'story',
            schema: z.string(),
        },
    ],
});

const countryPages = definePages({
    frontPage: {
        path: '/',
        page: FrontPage,
    },
});

const groupPages = definePages({
    aboutPage: {
        path: '/about',
        page: AboutPage,
    },
});

const hagen = declareSites(Site, {
    group: {
        label: 'Hagen Group',
        url: 'https://hagen.example.com',
        icon: '/icons/group.svg',
        pages: groupPages,
        companyName: 'Hagen Group AS',
    },
    uk: {
        label: 'Hagen UK',
        url: 'https://hagen.example.co.uk',
        icon: '/icons/uk.svg',
        pages: countryPages,
        collections: [Events],
        companyName: 'Hagen UK Ltd',
    },
    norway: {
        label: 'Hagen Norge',
        url: 'https://hagen.example.no',
        icon: '/icons/norway.svg',
        pages: countryPages,
        companyName: 'Hagen Norge AS',
    },
});

declare const content: CmsContent<{}, readonly [typeof PrivacyPolicy], readonly [typeof Offices], typeof hagen>;

describe("the current site's view", () => {
    it('reaches the shared content on every site', () => {
        expectTypeOf(content.collections.offices.list).returns.resolves.toHaveProperty('items');
        expectTypeOf(content.globals.privacyPolicy.get).returns.resolves.toEqualTypeOf<{ text: string }>();
    });

    it('reaches only what every site has without narrowing', () => {
        // @ts-expect-error only the uk site has events
        void content.collections.events;
        // @ts-expect-error the group site has no front page
        void content.pages.frontPage;
    });

    it('narrows to the sites `of` names, and on `site` to one of them', async () => {
        const countries = content.of(['uk', 'norway']);
        expectTypeOf(countries.site).toEqualTypeOf<'uk' | 'norway'>();
        expectTypeOf((await countries.pages.frontPage.get()).heading).toEqualTypeOf<string>();
        // @ts-expect-error norway has no events
        void countries.collections.events;
        if (countries.site === 'uk') {
            expectTypeOf(countries.collections.events.get).returns.resolves.toHaveProperty('title');
        }
        expectTypeOf((await content.of(['group']).pages.aboutPage.get()).story).toEqualTypeOf<string>();
        // @ts-expect-error denmark is not a declared site
        content.of(['denmark']);
    });
});
