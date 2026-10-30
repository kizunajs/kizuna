import { describe, expectTypeOf, it } from 'vitest';
import { cms } from './provider.js';
import { declareSites, SiteSchema } from './site.js';
import type { CmsDatabase } from './storage/store.js';

declare const db: CmsDatabase;

const sites = declareSites(SiteSchema, {
    uk: {
        label: 'Hagen UK',
        url: 'https://hagen.example.co.uk',
        icon: '/icons/uk.svg',
    },
});

describe("the refresh job's identity", () => {
    it('takes the identity under jobs', () => {
        const provider = cms({
            db,
            sites,
            jobs: {
                identity: 'scheduler',
            },
            auth: {
                identity: 'editor',
            },
        });
        expectTypeOf<keyof NonNullable<typeof provider.jobs>>().toEqualTypeOf<'refreshSite'>();
    });

    it('needs the identity when jobs is given', () => {
        cms({
            db,
            sites,
            // @ts-expect-error jobs names no identity
            jobs: {},
            auth: {
                identity: 'editor',
            },
        });
    });
});
