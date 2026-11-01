import { z } from 'zod';
import { pageInstructions } from '../voice';
import { croppedImage, definePage, definePages } from '@kizunajs/cms';
import { ImageSchema, link, RichTextSchema } from '@kizunajs/cms/schemas';

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
        {
            name: 'hero',
            schema: croppedImage({
                aspectRatio: '16:9',
            }).optional(),
        },
        {
            name: 'body',
            label: 'Text',
            schema: RichTextSchema.optional().describe('A few lines under the photo, with links to pages here and on the other sites.'),
        },
    ],
});

const eventsPage = definePage({
    name: 'eventsPage',
    label: 'Events',
    instructions: pageInstructions,
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
 * A page of text on one of the two sites: a heading, an intro, paragraphs,
 * and a photo beside them.
 */
const textPage = <const Name extends string, const Sites extends readonly string[]>(page: { name: Name; label: string; sites: Sites }) =>
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
                name: 'image',
                schema: ImageSchema.optional(),
                position: 'sidebar',
            },
            {
                name: 'related',
                label: 'Read more',
                schema: z.array(link()).max(4).optional(),
            },
        ],
    });

/**
 * The pages of the countries app, which the UK and Norway both deploy. Each
 * site keeps its own copy of every page, and a page that names `sites` exists
 * on those alone, at an address in their language.
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
    visitPage: {
        path: '/visit',
        page: textPage({
            name: 'visitPage',
            label: 'Visit the shop',
            sites: ['uk'],
        }),
    },
    plantCarePage: {
        path: '/plant-care',
        page: textPage({
            name: 'plantCarePage',
            label: 'Plant care',
            sites: ['uk'],
        }),
    },
    plantDoctorPage: {
        path: '/plant-care/plant-doctor',
        page: textPage({
            name: 'plantDoctorPage',
            label: 'Plant doctor',
            sites: ['uk'],
        }),
    },
    deliveryPage: {
        path: '/delivery',
        page: textPage({
            name: 'deliveryPage',
            label: 'Delivery',
            sites: ['uk'],
        }),
    },
    shopsPage: {
        path: '/butikker',
        page: textPage({
            name: 'shopsPage',
            label: 'Butikker',
            sites: ['norway'],
        }),
    },
    osloShopPage: {
        path: '/butikker/oslo',
        page: textPage({
            name: 'osloShopPage',
            label: 'Oslo',
            sites: ['norway'],
        }),
    },
    bergenShopPage: {
        path: '/butikker/bergen',
        page: textPage({
            name: 'bergenShopPage',
            label: 'Bergen',
            sites: ['norway'],
        }),
    },
    trondheimShopPage: {
        path: '/butikker/trondheim',
        page: textPage({
            name: 'trondheimShopPage',
            label: 'Trondheim',
            sites: ['norway'],
        }),
    },
    aboutPage: {
        path: '/om-oss',
        page: textPage({
            name: 'aboutPage',
            label: 'Om oss',
            sites: ['norway'],
        }),
    },
    historyPage: {
        path: '/om-oss/historie',
        page: textPage({
            name: 'historyPage',
            label: 'Historie',
            sites: ['norway'],
        }),
    },
    customerServicePage: {
        path: '/kundeservice',
        page: textPage({
            name: 'customerServicePage',
            label: 'Kundeservice',
            sites: ['norway'],
        }),
    },
});
