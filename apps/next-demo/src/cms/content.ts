import { z } from 'zod';
import { defineCollection, defineGlobal } from '@kizunajs/cms';
import { ImageSchema, RichTextSchema } from '@kizunajs/cms/schemas';
import { ArticleId, EmployeeId } from '../models';
import { HeadingSchema } from './schemas';

/**
 * What editors and visitors see for each department.
 */
export const departments = {
    design: 'Design',
    engineering: 'Engineering',
    sales: 'Sales',
    support: 'Support',
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
            name: 'name',
            schema: z.string().min(1).max(60),
        },
        {
            name: 'role',
            schema: z.string().min(1).max(60).describe('Their title, as on a business card.'),
        },
        {
            name: 'department',
            schema: z.enum(['design', 'engineering', 'sales', 'support']),
            options: departments,
        },
        {
            name: 'email',
            schema: z.email().optional(),
        },
        {
            name: 'photo',
            schema: ImageSchema.optional(),
        },
        {
            name: 'bio',
            schema: z.string().max(280).optional().describe('Two sentences at most.'),
        },
        {
            name: 'order',
            label: 'Sort order',
            schema: z.int().min(0).default(0).describe('Lower comes first within a department.'),
        },
    ],
    migrate: {
        1: (document) => ({
            ...document,
            department: lowercase(document['department']),
        }),
    },
    indexes: ['department', 'order', 'name'],
});

/**
 * What every page shares, read by the footer.
 */
export const Site = defineGlobal({
    name: 'site',
    group: 'Company',
    fields: [
        {
            name: 'footerText',
            schema: z.string().min(1).max(160).describe('One line under every page.'),
        },
        {
            name: 'contactEmail',
            schema: z.email(),
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
            name: 'title',
            schema: HeadingSchema,
        },
        {
            name: 'slug',
            schema: z
                .string()
                .min(1)
                .max(60)
                .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
                .describe('Lowercase words joined by dashes, like spring-sale.'),
        },
        {
            name: 'topic',
            schema: z.enum(['news', 'guides', 'stories']),
            options: topics,
        },
        {
            name: 'excerpt',
            schema: z.string().max(200).describe('One or two sentences for the blog index.'),
        },
        {
            name: 'cover',
            label: 'Cover image',
            schema: ImageSchema,
        },
        {
            name: 'body',
            schema: RichTextSchema,
        },
        {
            name: 'author',
            schema: EmployeeId.optional(),
        },
    ],
    migrate: {
        1: (document) => ({
            ...document,
            topic: lowercase(document['topic']),
        }),
    },
    indexes: ['topic'],
});
