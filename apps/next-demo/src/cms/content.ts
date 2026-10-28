import { z } from 'zod';
import { defineCollection, defineGlobal } from '@kizunajs/cms';
import { ImageSchema, RichTextSchema } from '@kizunajs/cms/schemas';
import { ArticleId, EmployeeId } from '../models';
import { HeadingSchema, LinkSchema } from './schemas';

/**
 * What editors and visitors see for each department.
 */
export const departments = {
    design: 'Design',
    engineering: 'Engineering',
    sales: 'Sales',
    support: 'Plant care',
};

/**
 * What editors and visitors see for each topic.
 */
export const topics = {
    news: 'News',
    guides: 'Guides',
    stories: 'Stories',
};

/**
 * Stored values from before the enums were lowercase.
 */
const lowercase = (value: unknown): unknown => (typeof value === 'string' ? value.toLowerCase() : value);

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
        {
            name: 'bio',
            schema: z.string().max(280).optional().describe('Two sentences at most.'),
        },
        {
            name: 'photo',
            schema: ImageSchema.optional(),
            position: 'sidebar',
        },
        {
            name: 'department',
            schema: z.enum(['design', 'engineering', 'sales', 'support']),
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
    migrate: {
        1: (document) => ({
            ...document,
            department: lowercase(document['department']),
        }),
    },
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
                    name: 'announcement',
                    schema: z
                        .string()
                        .max(90)
                        .optional()
                        .describe('One line above the menu, like a delivery cut-off. Leave empty to hide.'),
                },
            ],
        },
    ],
});

/**
 * The links and contact details at the bottom of every page.
 */
export const Footer = defineGlobal({
    name: 'footer',
    group: 'Site',
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
        {
            type: 'row',
            fields: [
                {
                    name: 'address',
                    schema: z.string().min(1).max(120),
                },
                {
                    name: 'openingHours',
                    schema: z.string().min(1).max(120).describe('When the shop is open, like Mon to Fri 10 to 18.'),
                },
            ],
        },
    ],
});

/**
 * The blog's articles. `app/blog/[slug]` shows each one at its slug, and the
 * front page features a few by id.
 */
export const Articles = defineCollection({
    name: 'articles',
    id: ArticleId,
    group: 'Blog',
    fields: [
        {
            type: 'tab',
            label: 'Content',
            fields: [
                {
                    name: 'title',
                    schema: HeadingSchema,
                },
                {
                    name: 'body',
                    schema: RichTextSchema,
                },
            ],
        },
        {
            type: 'tab',
            label: 'Meta',
            fields: [
                {
                    name: 'excerpt',
                    schema: z.string().max(200).describe('One or two sentences for the blog index and search results.'),
                },
                {
                    name: 'related',
                    label: 'Related articles',
                    schema: z.array(ArticleId).max(3).default([]),
                    description: 'Shown under the article. Up to three; none shows the latest of the same topic.',
                },
            ],
        },
        {
            name: 'cover',
            label: 'Cover image',
            schema: ImageSchema,
            position: 'sidebar',
        },
        {
            name: 'slug',
            schema: z
                .string()
                .min(1)
                .max(60)
                .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
                .describe('Lowercase words joined by dashes, like plant-now-for-april.'),
            position: 'sidebar',
        },
        {
            name: 'publishedOn',
            label: 'Date',
            schema: z.iso.date().optional().describe('The date the blog shows. Lists sort by it, newest first.'),
            position: 'sidebar',
        },
        {
            name: 'topic',
            schema: z.enum(['news', 'guides', 'stories']),
            options: topics,
            position: 'sidebar',
        },
        {
            name: 'author',
            schema: EmployeeId.optional(),
            position: 'sidebar',
        },
    ],
    migrate: {
        1: (document) => ({
            ...document,
            topic: lowercase(document['topic']),
        }),
    },
    indexes: ['topic', 'publishedOn'],
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
