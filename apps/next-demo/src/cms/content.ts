import { z } from 'zod';
import { defineCollection, defineGlobal } from '@kizunajs/cms';
import { ImageSchema, RichTextSchema, SeoSchema } from '@kizunajs/cms/schemas';
import { ArticleId, EmployeeId } from '../models';
import { HeadingSchema, LinkSchema } from './schemas';

/**
 * What editors and visitors see for each department.
 */
export const departments = {
    shop: 'In the shop',
    care: 'Plant care',
    offices: 'Office plants',
    online: 'Online and delivery',
};

/**
 * What editors and visitors see for each topic.
 */
export const topics = {
    care: 'Plant care',
    season: 'In season',
    growers: 'Growers',
};

/**
 * The people on the team. Editors add and remove them; the team page lists
 * them, and other pages pick a few by id.
 */
export const Employees = defineCollection({
    name: 'employees',
    id: EmployeeId,
    group: 'Company',
    fields: [
        {
            type: 'row',
            fields: [
                {
                    name: 'name',
                    schema: z.string().min(1).max(60),
                },
                {
                    name: 'role',
                    schema: z.string().min(1).max(60).describe('Their title, as on a business card.'),
                },
            ],
        },
        {
            name: 'bio',
            schema: z.string().max(280).optional().describe('Two sentences at most.'),
        },
        {
            name: 'favouritePlant',
            label: 'Favourite plant',
            schema: z.string().max(60).optional().describe('Its Latin name, which the team page sets in italics.'),
        },
        {
            type: 'collapsible',
            label: 'Contact',
            fields: [
                {
                    type: 'row',
                    fields: [
                        {
                            name: 'email',
                            schema: z.email().optional(),
                        },
                        {
                            name: 'phone',
                            schema: z.string().max(20).optional(),
                        },
                    ],
                },
            ],
        },
        {
            name: 'photo',
            schema: ImageSchema.optional(),
            position: 'sidebar',
        },
        {
            name: 'department',
            schema: z.enum(['shop', 'care', 'offices', 'online']),
            options: departments,
            position: 'sidebar',
        },
        {
            name: 'order',
            label: 'Sort order',
            schema: z.int().min(0).default(0).describe('Lower comes first within a department.'),
            position: 'sidebar',
        },
    ],
    indexes: ['department', 'order', 'name'],
    preview: {
        url: () => '/team',
    },
});

/**
 * The menu at the top of every page.
 */
export const Header = defineGlobal({
    name: 'header',
    group: 'Site',
    fields: [
        {
            name: 'navItems',
            label: 'Menu',
            schema: z.array(LinkSchema).max(6),
            description: 'In this order, after the logo.',
        },
        {
            type: 'collapsible',
            label: 'Announcement',
            fields: [
                {
                    type: 'row',
                    fields: [
                        {
                            name: 'announcement',
                            schema: z
                                .string()
                                .max(90)
                                .optional()
                                .describe('One line in a green band above the menu, like a delivery cut-off.'),
                        },
                        {
                            name: 'announcementLink',
                            label: 'Link',
                            schema: LinkSchema.optional(),
                        },
                    ],
                },
            ],
        },
        {
            name: 'showAnnouncement',
            schema: z.boolean().default(true).describe('Show the green band above the menu.'),
            position: 'sidebar',
        },
    ],
});

/**
 * The newsletter, links and shop details at the bottom of every page.
 */
export const Footer = defineGlobal({
    name: 'footer',
    group: 'Site',
    fields: [
        {
            type: 'tab',
            label: 'Newsletter',
            fields: [
                {
                    name: 'newsletterHeading',
                    label: 'Heading',
                    schema: HeadingSchema.optional(),
                },
                {
                    name: 'newsletterText',
                    label: 'Text',
                    schema: z.string().max(160).optional(),
                },
            ],
        },
        {
            type: 'tab',
            label: 'Visit',
            fields: [
                {
                    name: 'address',
                    schema: z.string().min(1).max(120),
                },
                {
                    name: 'openingHours',
                    schema: z
                        .array(
                            z.object({
                                days: z.string().min(1).max(30).describe('Like Monday to Friday.'),
                                hours: z.string().min(1).max(30).describe('Like 10 to 18, or Closed.'),
                            })
                        )
                        .max(7)
                        .default([]),
                },
                {
                    type: 'row',
                    fields: [
                        {
                            name: 'contactEmail',
                            schema: z.email(),
                        },
                        {
                            name: 'phone',
                            schema: z.string().min(1).max(20),
                        },
                    ],
                },
            ],
        },
        {
            type: 'tab',
            label: 'Links',
            fields: [
                {
                    name: 'tagline',
                    schema: z.string().min(1).max(160).describe('One line under the logo.'),
                },
                {
                    name: 'navItems',
                    label: 'Links',
                    schema: z.array(LinkSchema).max(8),
                },
            ],
        },
        {
            name: 'showNewsletter',
            schema: z.boolean().default(true).describe('Show the newsletter sign-up above the links.'),
            position: 'sidebar',
        },
    ],
});

/**
 * The journal's articles. `app/blog/[slug]` shows each one at its slug, and
 * the front page features a few by id.
 */
export const Articles = defineCollection({
    name: 'articles',
    id: ArticleId,
    group: 'Journal',
    fields: [
        {
            type: 'tab',
            label: 'Content',
            fields: [
                {
                    name: 'title',
                    schema: z.string().min(1).max(60).describe('Under 8 words.'),
                },
                {
                    name: 'excerpt',
                    schema: z.string().max(200).describe('One or two sentences, under the title and in lists.'),
                },
                {
                    name: 'body',
                    schema: RichTextSchema,
                },
            ],
        },
        {
            type: 'tab',
            label: 'SEO',
            fields: [
                {
                    name: 'seo',
                    label: 'SEO',
                    schema: SeoSchema.optional(),
                    description: 'Leave empty to use the title and excerpt.',
                },
            ],
        },
        {
            name: 'cover',
            label: 'Cover photo',
            schema: ImageSchema,
            position: 'sidebar',
        },
        {
            name: 'coverCaption',
            label: 'Cover caption',
            schema: z.string().max(80).optional().describe('A few words under the photo, like where it was taken.'),
            position: 'sidebar',
        },
        {
            name: 'slug',
            schema: z
                .string()
                .min(1)
                .max(60)
                .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
                .describe('Lowercase words joined by dashes, like plant-bulbs-before-the-frost.'),
            position: 'sidebar',
        },
        {
            name: 'publishedOn',
            label: 'Date',
            schema: z.iso.date().optional().describe('The date the journal shows. Lists sort by it, newest first.'),
            position: 'sidebar',
        },
        {
            name: 'topic',
            schema: z.enum(['care', 'season', 'growers']),
            options: topics,
            position: 'sidebar',
        },
        {
            name: 'author',
            schema: EmployeeId.optional(),
            position: 'sidebar',
        },
        {
            type: 'collapsible',
            label: 'Related articles',
            position: 'sidebar',
            fields: [
                {
                    name: 'related',
                    label: 'Articles',
                    schema: z.array(ArticleId).max(3).default([]),
                    description: 'Shown under the article. Up to three; none shows the latest of the same topic.',
                },
            ],
        },
    ],
    indexes: ['topic', 'publishedOn'],
    columns: ['topic', 'author'],
    migrate: {
        // Titles once wrapped words in *asterisks* for italics. The admin names an article by its title, so it holds plain text.
        1: (document) => ({
            ...document,
            title: typeof document['title'] === 'string' ? document['title'].replaceAll('*', '') : document['title'],
        }),
    },
    actions: {
        announce: {
            label: 'Announce to the team',
            confirm: 'Post this article to the team channel?',
            handler: ({ item, editor }) => {
                // The demo sends no messages, so the announcement goes to the server log.
                console.log(`[demo] ${String(editor['name'])} announced "${item.title}" at /blog/${item.slug}`);
            },
        },
    },
});
