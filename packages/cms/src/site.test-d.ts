import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { declareSites, SiteSchema } from './site.js';

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
});
