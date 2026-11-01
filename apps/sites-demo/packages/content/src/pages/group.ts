import { z } from 'zod';
import { pageInstructions } from '../voice';
import { definePage, definePages } from '@kizunajs/cms';
import { link } from '@kizunajs/cms/schemas';

const frontPage = definePage({
    name: 'frontPage',
    label: 'Front page',
    instructions: pageInstructions,
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
    instructions: pageInstructions,
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
 * A page of text: a heading, an intro and paragraphs.
 */
const textPage = <const Name extends string>(page: { name: Name; label: string }) =>
    definePage({
        ...page,
        instructions: pageInstructions,
        fields: [
            {
                name: 'heading',
                schema: z.string().min(1).max(80),
            },
            {
                name: 'intro',
                schema: z.string().min(1).max(400),
            },
            {
                name: 'body',
                schema: z.string().min(1).max(4000).describe('Paragraphs, with a blank line between each.'),
            },
            {
                name: 'related',
                label: 'Read more',
                schema: z.array(link()).max(4).optional(),
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
    historyPage: {
        path: '/about/history',
        page: textPage({
            name: 'historyPage',
            label: 'History',
        }),
    },
    sustainabilityPage: {
        path: '/about/sustainability',
        page: textPage({
            name: 'sustainabilityPage',
            label: 'Sustainability',
        }),
    },
    careersPage: {
        path: '/careers',
        page: textPage({
            name: 'careersPage',
            label: 'Careers',
        }),
    },
});
