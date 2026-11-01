import { z } from 'zod';
import { defineGlobal } from '@kizunajs/cms';
import { link } from '@kizunajs/cms/schemas';

/**
 * The group site's footer: the country sites, careers and the privacy
 * policy, each a page picked in the CMS or a URL.
 */
export const Navigation = defineGlobal({
    name: 'navigation',
    label: 'Navigation',
    group: 'Company',
    fields: [
        {
            name: 'footer',
            schema: z.array(link()).min(1).max(8),
        },
    ],
});
