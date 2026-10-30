import { z } from 'zod';
import { defineGlobal } from '@kizunajs/cms';

/**
 * One privacy policy for the whole group, which every site links to.
 */
export const PrivacyPolicy = defineGlobal({
    name: 'privacyPolicy',
    label: 'Privacy policy',
    group: 'Company',
    fields: [
        {
            name: 'heading',
            schema: z.string().min(1).max(80),
        },
        {
            name: 'updatedOn',
            label: 'Last updated',
            schema: z.iso.date(),
            position: 'sidebar',
        },
        {
            name: 'body',
            schema: z.string().min(1).max(6000).describe('Paragraphs, with a blank line between each.'),
        },
    ],
});
