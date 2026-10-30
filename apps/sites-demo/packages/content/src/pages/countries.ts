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

const eventsPage = definePage({
    name: 'eventsPage',
    label: 'Events',
    sites: ['uk'],
    fields: [
        {
            name: 'heading',
            schema: z.string().min(1).max(80),
        },
        {
            name: 'intro',
            schema: z.string().max(280).optional(),
        },
    ],
});

/**
 * The pages of the countries app, which the UK and Norway both deploy. Each
 * site keeps its own copy of every page.
 */
export const pages = definePages({
    frontPage: {
        path: '/',
        page: frontPage,
    },
    eventsPage: {
        path: '/events',
        page: eventsPage,
    },
});
