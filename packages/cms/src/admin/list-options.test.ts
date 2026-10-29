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
        {
            name: 'excerpt',
            schema: z.string().optional(),
        },
    ],
    indexes: ['topic', 'tags', 'author', 'order', 'title'],
    columns: ['excerpt', 'topic'],
});

describe('how the admin lists each collection', () => {
    it('names the field each item points up with, in a collection with a tree', () => {
        expect(listOptionsOf([Tags]).tags).toEqual({
            tree: 'parent',
            filters: [],
            columns: [],
        });
    });

    it('filters by the enums and ids of its indexes, and offers its columns, then every index', () => {
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
            columns: [
                {
                    field: 'excerpt',
                    label: null,
                    sortable: false,
                    shown: true,
                },
                {
                    field: 'topic',
                    label: null,
                    sortable: true,
                    shown: true,
                },
                {
                    field: 'tags',
                    label: null,
                    sortable: true,
                    shown: false,
                },
                {
                    field: 'author',
                    label: 'Written by',
                    sortable: true,
                    shown: false,
                },
                {
                    field: 'order',
                    label: null,
                    sortable: true,
                    shown: false,
                },
                {
                    field: 'title',
                    label: null,
                    sortable: true,
                    shown: false,
                },
            ],
        });
    });
});
