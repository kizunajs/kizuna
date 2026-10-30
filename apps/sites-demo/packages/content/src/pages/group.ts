import { z } from 'zod';
import { definePage, definePages } from '@kizunajs/cms';

const frontPage = definePage({
    name: 'frontPage',
    label: 'Front page',
    fields: [
        {
            name: 'heading',
            schema: z.string().min(1).max(80),
        },
        {
            name: 'intro',
            schema: z.string().min(1).max(400),
        },
    ],
});

const aboutPage = definePage({
    name: 'aboutPage',
    label: 'About',
    fields: [
        {
            name: 'heading',
            schema: z.string().min(1).max(80),
        },
        {
            name: 'body',
            schema: z.string().min(1).max(2000).describe('Paragraphs, with a blank line between each.'),
        },
    ],
});

/**
 * The group site's pages, which the group app renders.
 */
export const pages = definePages({
    frontPage: {
        path: '/',
        page: frontPage,
    },
    aboutPage: {
        path: '/about',
        page: aboutPage,
    },
});
