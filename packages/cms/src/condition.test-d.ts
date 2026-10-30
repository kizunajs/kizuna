import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { defineBlock } from './block.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { definePage } from './page.js';
import { Kizuna } from 'kizunajs';
import type { Output } from './output.js';

const ArticleId = Kizuna.brand('ArticleId', z.string());

test('a field with a condition reads as possibly empty, since it may be hidden', () => {
    const Articles = defineCollection({
        name: 'articles',
        id: ArticleId,
        fields: [
            {
                name: 'category',
                schema: z.enum(['news', 'guide']),
            },
            {
                name: 'difficulty',
                schema: z.enum(['easy', 'hard']),
                condition: {
                    field: 'category',
                    is: 'guide',
                },
            },
        ],
    });
    expectTypeOf<z.output<typeof Articles.schema>>().toEqualTypeOf<{
        category: 'news' | 'guide';
        difficulty?: 'easy' | 'hard' | undefined;
    }>();
});

test('a condition reads a field inside a layout item, and takes a list of values or isNot', () => {
    const Header = defineGlobal({
        name: 'header',
        fields: [
            {
                type: 'collapsible',
                label: 'Announcement',
                fields: [
                    {
                        name: 'announcement',
                        schema: z.string().max(90),
                        condition: {
                            field: 'showAnnouncement',
                            is: true,
                        },
                    },
                ],
            },
            {
                name: 'showAnnouncement',
                schema: z.boolean().default(true),
            },
            {
                name: 'tone',
                schema: z.enum(['sage', 'forest', 'sand']),
            },
            {
                name: 'note',
                schema: z.string().optional(),
                condition: {
                    field: 'tone',
                    isNot: ['sage', 'sand'],
                },
            },
        ],
    });
    expectTypeOf<Output<typeof Header>['announcement']>().toEqualTypeOf<string | undefined>();
});

test('a block field with a condition reads its sibling', () => {
    const CallToActionBlockSchema = defineBlock({
        name: 'callToAction',
        fields: [
            {
                name: 'showButton',
                schema: z.boolean(),
            },
            {
                name: 'buttonLabel',
                schema: z.string().max(30),
                condition: {
                    field: 'showButton',
                    is: true,
                },
            },
        ],
    });
    expectTypeOf<z.output<typeof CallToActionBlockSchema>>().toEqualTypeOf<{
        showButton: boolean;
        buttonLabel?: string | undefined;
    }>();
});

test('a condition naming no field beside it fails to compile', () => {
    definePage({
        name: 'aboutPage',
        // @ts-expect-error 'category' is not a field of this page
        fields: [
            {
                name: 'difficulty',
                schema: z.string(),
                condition: {
                    field: 'category',
                    is: 'guide',
                },
            },
        ],
    });
});

test('a condition comparing with a value the field cannot hold fails to compile', () => {
    definePage({
        name: 'aboutPage',
        // @ts-expect-error 'guides' is not one of the categories
        fields: [
            {
                name: 'category',
                schema: z.enum(['news', 'guide']),
            },
            {
                name: 'difficulty',
                schema: z.string(),
                condition: {
                    field: 'category',
                    is: 'guides',
                },
            },
        ],
    });
    defineBlock({
        name: 'callToAction',
        // @ts-expect-error a boolean is never 'yes'
        fields: [
            {
                name: 'showButton',
                schema: z.boolean(),
            },
            {
                name: 'buttonLabel',
                schema: z.string(),
                condition: {
                    field: 'showButton',
                    is: 'yes',
                },
            },
        ],
    });
});
