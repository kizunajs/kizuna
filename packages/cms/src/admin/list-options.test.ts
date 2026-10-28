import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineCollection } from '../definitions.js';
import { listOptionsOf } from './list-options.js';

const TagId = Kizuna.brand('TagId', z.string());
const EmployeeId = Kizuna.brand('EmployeeId', z.string());

const Tags = defineCollection({
    name: 'tags',
    id: TagId,
    tree: 'parent',
    fields: [
        {
            name: 'name',
            schema: z.string(),
        },
        {
            name: 'parent',
            schema: TagId.optional(),
        },
    ],
});

const Articles = defineCollection({
    name: 'articles',
    id: Kizuna.brand('ArticleId', z.string()),
    fields: [
        {
            name: 'title',
            schema: z.string(),
        },
        {
            name: 'topic',
            schema: z.enum(['news', 'guides']),
            options: {
                news: 'News',
                guides: 'Guides',
            },
        },
        {
            name: 'tags',
            schema: z.array(TagId),
        },
        {
            name: 'author',
            label: 'Written by',
            schema: EmployeeId.optional(),
        },
        {
            name: 'order',
            schema: z.int(),
        },
    ],
    indexes: ['topic', 'tags', 'author', 'order', 'title'],
});

describe('how the admin lists each collection', () => {
    it('names the field each item points up with, in a collection with a tree', () => {
        expect(listOptionsOf([Tags]).tags).toEqual({
            tree: 'parent',
            filters: [],
        });
    });

    it('filters by the enums and ids of its indexes, and sorts by the rest', () => {
        expect(listOptionsOf([Tags, Articles]).articles).toEqual({
            filters: [
                {
                    field: 'topic',
                    label: null,
                    choices: [
                        {
                            value: 'news',
                            label: 'News',
                        },
                        {
                            value: 'guides',
                            label: 'Guides',
                        },
                    ],
                },
                {
                    field: 'tags',
                    label: null,
                    brand: 'TagId',
                    nested: true,
                },
                {
                    field: 'author',
                    label: 'Written by',
                    brand: 'EmployeeId',
                    nested: false,
                },
            ],
        });
    });
});
