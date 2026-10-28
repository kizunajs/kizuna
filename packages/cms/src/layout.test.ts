import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { defineBlock } from './block.js';
import { describeFields, describeLayout, fieldChain, refsOf } from './content.js';
import { defineCollection, defineGlobal } from './definitions.js';
import { dataFields, undeclaredFieldRoles, type FieldList } from './field.js';
import { ImageSchema } from './image.js';
import { definePage } from './page.js';
import { cms } from './provider.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';

const EmployeeId = Kizuna.brand('EmployeeId', z.string());

const CardBlockSchema = defineBlock({
    name: 'card',
    fields: [
        {
            type: 'row',
            fields: [
                {
                    name: 'heading',
                    schema: z.string().max(60),
                    width: '50%',
                },
                {
                    name: 'image',
                    schema: ImageSchema.optional(),
                    width: '50%',
                },
            ],
        },
    ],
});

const ArticlePage = definePage({
    name: 'articlePage',
    fields: [
        {
            type: 'tab',
            label: 'Content',
            fields: [
                {
                    name: 'title',
                    schema: z.string().max(80),
                },
                {
                    name: 'author',
                    schema: EmployeeId.optional(),
                    auth: {
                        roles: 'admin',
                    },
                },
            ],
        },
        {
            type: 'tab',
            label: 'Card',
            fields: [
                {
                    name: 'card',
                    schema: CardBlockSchema,
                },
            ],
        },
        {
            type: 'collapsible',
            label: 'Publishing',
            position: 'sidebar',
            fields: [
                {
                    name: 'category',
                    schema: z.enum(['news', 'guide']),
                },
            ],
        },
        {
            name: 'featured',
            schema: z.boolean().default(false),
            position: 'sidebar',
        },
    ],
});

describe('layout', () => {
    it('reads the fields inside layout items in their place', () => {
        expect(dataFields(ArticlePage.fields).map((field) => field.name)).toEqual(['title', 'author', 'card', 'category', 'featured']);
        expect(Object.keys(ArticlePage.schema.shape)).toEqual(['title', 'author', 'card', 'category', 'featured']);
        expect(Object.keys(CardBlockSchema.shape)).toEqual(['heading', 'image']);
    });

    it('checks content at the top level, as if no layout were there', () => {
        const result = ArticlePage.schema.safeParse({
            title: 'Hello',
            card: {
                heading: 'Read this',
            },
            category: 'news',
        });
        expect(result.success).toBe(true);
    });

    it('finds a field inside a tab by its plain path, and the block fields inside a row', () => {
        expect(fieldChain(ArticlePage.fields, 'title')?.map((field) => field.name)).toEqual(['title']);
        expect(fieldChain(ArticlePage.fields, 'card.heading')?.map((field) => field.name)).toEqual(['card', 'heading']);
        expect(fieldChain(ArticlePage.fields, 'Content')).toBeUndefined();
    });

    it('collects refs and roles from inside layout items', () => {
        expect(
            refsOf(ArticlePage, {
                title: 'Hello',
                author: 'ada',
            })
        ).toEqual([
            {
                brand: 'EmployeeId',
                refId: 'ada',
                fieldPath: 'author',
            },
        ]);
        expect(undeclaredFieldRoles(ArticlePage.fields, ['editor'])).toEqual([
            {
                field: 'author',
                role: 'admin',
            },
        ]);
    });

    it('describes each field with the layout items it sits in', () => {
        const described = describeFields(ArticlePage);
        expect(
            described.map((field) => ({
                path: field.path,
                position: field.position,
                layout: field.layout,
            }))
        ).toEqual([
            {
                path: 'title',
                position: undefined,
                layout: ['/0'],
            },
            {
                path: 'author',
                position: undefined,
                layout: ['/0'],
            },
            {
                path: 'card',
                position: undefined,
                layout: ['/1'],
            },
            {
                path: 'category',
                position: undefined,
                layout: ['/2'],
            },
            {
                path: 'featured',
                position: 'sidebar',
                layout: [],
            },
        ]);
        expect(
            described[2]!.fields!.map((field) => ({
                path: field.path,
                width: field.width,
                layout: field.layout,
            }))
        ).toEqual([
            {
                path: 'card.heading',
                width: '50%',
                layout: ['card/0'],
            },
            {
                path: 'card.image',
                width: '50%',
                layout: ['card/0'],
            },
        ]);
    });

    it('describes the layout items of the document and its blocks', () => {
        expect(describeLayout(ArticlePage)).toEqual([
            {
                id: '/0',
                type: 'tab',
                label: 'Content',
                position: undefined,
            },
            {
                id: '/1',
                type: 'tab',
                label: 'Card',
                position: undefined,
            },
            {
                id: 'card/0',
                type: 'row',
                label: undefined,
                position: undefined,
            },
            {
                id: '/2',
                type: 'collapsible',
                label: 'Publishing',
                position: 'sidebar',
            },
        ]);
    });

    it('gives a nested layout item the id of the one that holds it', () => {
        const page = definePage({
            name: 'aboutPage',
            fields: [
                {
                    type: 'tab',
                    label: 'Content',
                    fields: [
                        {
                            name: 'heading',
                            schema: z.string(),
                        },
                        {
                            type: 'row',
                            fields: [
                                {
                                    name: 'image',
                                    schema: ImageSchema,
                                },
                            ],
                        },
                    ],
                },
            ],
        });
        expect(describeFields(page).map((field) => field.layout)).toEqual([['/0'], ['/0', '/0/1']]);
        expect(describeLayout(page).map((item) => item.id)).toEqual(['/0', '/0/1']);
    });

    it('describes a plain field list with no layout', () => {
        const page = definePage({
            name: 'aboutPage',
            fields: [
                {
                    name: 'heading',
                    schema: z.string(),
                },
            ],
        });
        expect(describeFields(page)[0]!.layout).toEqual([]);
        expect(describeLayout(page)).toEqual([]);
    });

    it('refuses a field listed inside a tab and outside it', () => {
        const fields: FieldList = [
            {
                type: 'tab',
                label: 'Content',
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                    },
                ],
            },
            {
                name: 'heading',
                schema: z.string(),
            },
        ];
        expect(() =>
            definePage({
                name: 'aboutPage',
                fields,
            })
        ).toThrow("definePage('aboutPage') lists the field 'heading' twice.");
    });

    it('refuses layout items it cannot show', () => {
        const define = (fields: FieldList) => () =>
            definePage({
                name: 'aboutPage',
                fields,
            });
        expect(
            define([
                {
                    type: 'tab',
                    label: '',
                    fields: [
                        {
                            name: 'heading',
                            schema: z.string(),
                        },
                    ],
                },
            ])
        ).toThrow('has a tab with no label');
        expect(
            define([
                {
                    type: 'row',
                    fields: [],
                },
            ])
        ).toThrow('has a row that holds no fields');
        expect(
            define([
                {
                    type: 'tab',
                    label: 'Content',
                    fields: [
                        {
                            name: 'heading',
                            schema: z.string(),
                            position: 'sidebar',
                        },
                    ],
                },
            ])
        ).toThrow("puts the field 'heading' in the sidebar from inside a layout item");
    });

    it('refuses a block field in the sidebar', () => {
        expect(() =>
            defineBlock({
                name: 'hero',
                fields: [
                    {
                        name: 'heading',
                        schema: z.string(),
                        position: 'sidebar',
                    },
                ],
            })
        ).toThrow("defineBlock('hero') puts the field 'heading' in the sidebar.");
    });

    it('checks a collection index against the fields inside its tabs', () => {
        expect(() =>
            defineCollection({
                name: 'employees',
                id: EmployeeId,
                fields: [
                    {
                        type: 'tab',
                        label: 'Profile',
                        fields: [
                            {
                                name: 'name',
                                schema: z.string(),
                            },
                        ],
                    },
                ],
                indexes: ['name'],
            })
        ).not.toThrow();
    });
});

describe('layout over the API', () => {
    const k = new Kizuna();
    const editor = k.identity
        .bearer({
            context: z.object({
                userId: z.string(),
            }),
        })
        .guard(({ bearer, deny }) => {
            if (bearer?.token === 'editor-token') {
                return {
                    userId: 'ada',
                };
            }
            return deny({
                status: 401,
                body: {
                    detail: 'Unauthorized',
                },
            });
        });
    const Site = defineGlobal({
        name: 'site',
        fields: [
            {
                type: 'tab',
                label: 'Footer',
                fields: [
                    {
                        name: 'footer',
                        schema: z.string().max(80),
                    },
                ],
            },
            {
                name: 'tagline',
                schema: z.string().max(40).optional(),
                position: 'sidebar',
            },
        ],
    });
    const db = drizzle(new PGlite());
    const config = defineConfig({
        adapter: expressAdapter(),
        auth: {
            identities: {
                editor,
            },
        },
        content: cms({
            db,
            pages: {},
            globals: [Site],
            auth: {
                identity: 'editor',
            },
            media: {
                storage: memoryMediaStorage(),
            },
            appDir: 'src/__fixtures__/app',
        }),
    });
    const app = express();
    config.api.mount(app);
    const asEditor = (call: request.Test) => call.set('authorization', 'Bearer editor-token');

    beforeAll(async () => {
        await new DocumentStore(db).createTables();
    });

    it('sends the editor each field with its layout, and the layout items', async () => {
        const described = await asEditor(request(app).get('/editing/describe').query({ ref: 'global:site' }));
        expect(described.status).toBe(200);
        expect(described.body.layout).toEqual([
            {
                id: '/0',
                type: 'tab',
                label: 'Footer',
            },
        ]);
        expect(described.body.fields[0]).toMatchObject({
            path: 'footer',
            layout: ['/0'],
        });
        expect(described.body.fields[0]).not.toHaveProperty('position');
        expect(described.body.fields[1]).toMatchObject({
            path: 'tagline',
            position: 'sidebar',
        });
        expect(described.body.fields[1]).not.toHaveProperty('layout');
    });

    it('saves a field inside a tab at its plain path', async () => {
        const saved = await asEditor(request(app).patch('/editing/globals/site/draft')).send({
            changes: {
                footer: 'Made in Oslo',
            },
        });
        expect(saved.status).toBe(200);
        expect(saved.body.content).toEqual({
            footer: 'Made in Oslo',
        });
    });
});
