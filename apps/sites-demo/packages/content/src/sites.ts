import { z } from 'zod';
import { declareSites, SiteSchema } from '@kizunajs/cms';
import { pages as groupPages } from './pages/group';
import { pages as countryPages } from './pages/countries';
import { Events } from './events';

export const Site = SiteSchema.extend({
    companyName: z.string(),
});

/**
 * Hagen's three sites. The countries app is deployed twice, as the UK and as
 * Norway, so the two share its pages module and keep their own pages.
 */
export const sites = declareSites(Site, {
    group: {
        label: 'Hagen Group',
        url: process.env.KIZUNA_GROUP_URL ?? 'http://group.localhost:3040',
        icon: '/icons/group.svg',
        pages: groupPages,
        companyName: 'Hagen Group AS',
    },
    uk: {
        label: 'Hagen UK',
        url: process.env.KIZUNA_UK_URL ?? 'http://uk.localhost:3041',
        icon: '/icons/uk.svg',
        pages: countryPages,
        collections: [Events],
        companyName: 'Hagen UK Ltd',
    },
    norway: {
        label: 'Hagen Norge',
        url: process.env.KIZUNA_NORWAY_URL ?? 'http://norway.localhost:3042',
        icon: '/icons/norway.svg',
        pages: countryPages,
        // TODO(sites): `locales: ['nb']`, once declareSites() takes a literal list. Today `const` reads it as a readonly tuple, which fails SiteSchema's `string[]` and widens every site's pages.
        companyName: 'Hagen Norge AS',
    },
});
