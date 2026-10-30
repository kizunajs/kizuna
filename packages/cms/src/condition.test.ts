import { beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { blocks, defineBlock } from './block.js';
import { conditionHolds, conditionText } from './condition.js';
import { describeFields, missingFields } from './content.js';
import { defineGlobal } from './definitions.js';
import { definePage } from './page.js';
import { cms } from './provider.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';

const CallToActionBlockSchema = defineBlock({
    name: 'callToAction',
    fields: [
        {
            name: 'heading',
            schema: z.string().max(60),
        },
        {
            name: 'showButton',
            schema: z.boolean().default(false),
        },
        {
            name: 'buttonLabel',
            schema: z.string().min(1).max(30),
            condition: {
                field: 'showButton',
                is: true,
            },
        },
    ],
});

const GuidePage = definePage({
    name: 'guidePage',
    fields: [
        {
            name: 'category',
            schema: z.enum(['news', 'guide', 'review']),
        },
        {
            type: 'collapsible',
            label: 'Guide',
            fields: [
                {
                    name: 'difficulty',
                    schema: z.enum(['easy', 'hard']),
                    condition: {
                        field: 'category',
                        is: 'guide',
                    },
                },
            ],
        },
        {
            name: 'callToAction',
            schema: CallToActionBlockSchema,
        },
        {
            name: 'sections',
            schema: blocks([CallToActionBlockSchema]).default([]),
        },
    ],
});

describe('conditionHolds', () => {
    it('compares with one value, or any of a list', () => {
        expect(
            conditionHolds(
                {
                    field: 'category',
                    is: 'guide',
                },
                'guide'
            )
        ).toBe(true);
        expect(
            conditionHolds(
                {
                    field: 'category',
                    is: ['guide', 'review'],
                },
                'news'
            )
        ).toBe(false);
        expect(
            conditionHolds(
                {
                    field: 'category',
                    isNot: ['guide', 'review'],
                },
                'news'
            )
        ).toBe(true);
        expect(
            conditionHolds(
                {
                    field: 'category',
                    isNot: 'news',
                },
                undefined
            )
        ).toBe(true);
    });

    it('reads a list as holding a value when it contains it', () => {
        expect(
            conditionHolds(
                {
                    field: 'tags',
                    is: 'featured',
                },
                ['new', 'featured']
            )
        ).toBe(true);
        expect(
            conditionHolds(
                {
                    field: 'tags',
                    isNot: 'featured',
                },
                ['new']
            )
        ).toBe(true);
    });

    it('says the condition in words for the agent', () => {
        expect(
            conditionText({
                field: 'category',
                is: 'guide',
            })
        ).toBe("Shown only while 'category' is 'guide'. While hidden, publishing does not need it, and a value it holds is kept.");
        expect(
            conditionText({
                field: 'showButton',
                isNot: [true],
            })
        ).toContain("'showButton' is not true");
    });
});

describe('a field with a condition', () => {
    it('is required only while it shows', () => {
        expect(
            missingFields(GuidePage, {
                category: 'news',
                callToAction: {
                    heading: 'Visit us',
                },
            })
        ).toEqual([]);
        expect(
            missingFields(GuidePage, {
                category: 'guide',
                callToAction: {
                    heading: 'Visit us',
                },
            })
        ).toEqual(['difficulty']);
    });

    it('lists every field the draft is missing at once, a shown conditional one among them', () => {
        expect(
            missingFields(GuidePage, {
                category: 'guide',
            })
        ).toEqual(['difficulty', 'callToAction']);
    });

    it('reads the values beside it inside a block, its default standing in for a value', () => {
        expect(
            GuidePage.schema.safeParse({
                category: 'news',
                callToAction: {
                    heading: 'Visit us',
                },
            }).success
        ).toBe(true);
        const shown = GuidePage.schema.safeParse({
            category: 'news',
            callToAction: {
                heading: 'Visit us',
                showButton: true,
            },
        });
        expect(shown.error?.issues.map((issue) => issue.path)).toEqual([['callToAction', 'buttonLabel']]);
    });

    it('reads the values beside it inside each item of a block list', () => {
        const parsed = GuidePage.schema.safeParse({
            category: 'news',
            callToAction: {
                heading: 'Visit us',
            },
            sections: [
                {
                    block: 'callToAction',
                    heading: 'Plant care',
                },
                {
                    block: 'callToAction',
                    heading: 'Delivery',
                    showButton: true,
                },
            ],
        });
        expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([['sections', 1, 'buttonLabel']]);
    });

    it('keeps a value it holds while hidden', () => {
        const parsed = GuidePage.schema.parse({
            category: 'news',
            difficulty: 'hard',
            callToAction: {
                heading: 'Visit us',
            },
        });
        expect(parsed.difficulty).toBe('hard');
    });

    it('is described with its condition, for fields in a block too', () => {
        const fields = describeFields(GuidePage);
        expect(fields.find((field) => field.path === 'difficulty')).toMatchObject({
            required: true,
            condition: {
                field: 'category',
                is: 'guide',
            },
        });
        const block = fields.find((field) => field.path === 'callToAction');
        expect(block?.fields?.find((field) => field.path === 'callToAction.buttonLabel')?.condition).toEqual({
            field: 'showButton',
            is: true,
        });
        expect(fields.find((field) => field.path === 'sections')?.blocks?.[0]?.fields.find((field) => field.name === 'buttonLabel')).toMatchObject({
            condition: {
                field: 'showButton',
                is: true,
            },
        });
    });

    it('is refused when its condition cannot be read', () => {
        expect(() =>
            definePage({
                name: 'brokenPage',
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
            } as never)
        ).toThrow("definePage('brokenPage') gives the field 'difficulty' a condition reading 'category', which is not a field beside it.");
        expect(() =>
            definePage({
                name: 'brokenPage',
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
            } as never)
        ).toThrow("comparing 'category' with 'guides', which its enum does not have.");
        expect(() =>
            definePage({
                name: 'brokenPage',
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
                            is: 'guide',
                        },
                    },
                    {
                        name: 'duration',
                        schema: z.string(),
                        condition: {
                            field: 'difficulty',
                            is: 'hard',
                        },
                    },
                ],
            } as never)
        ).toThrow('which shows by a condition of its own');
        expect(() =>
            definePage({
                name: 'brokenPage',
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
                            is: 'guide',
                            isNot: 'news',
                        },
                    },
                ],
            } as never)
        ).toThrow('that takes one of is and isNot');
    });
});

describe('a field with a condition over the API', () => {
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
    const Header = defineGlobal({
        name: 'header',
        fields: [
            {
                name: 'showAnnouncement',
                schema: z.boolean().default(true),
            },
            {
                name: 'announcement',
                schema: z.string().min(1).max(90),
                condition: {
                    field: 'showAnnouncement',
                    is: true,
                },
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
            globals: [Header],
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

    it('holds up publishing while the field shows and is empty, its sibling read through its default', async () => {
        await asEditor(request(app).patch('/editing/globals/header/draft')).send({
            changes: {
                showAnnouncement: true,
            },
        });
        const refused = await asEditor(request(app).post('/editing/globals/header/publish')).send({});
        expect(refused.status).toBe(409);
        expect(refused.body.missing).toEqual(['announcement']);
    });

    it('describes the field as shown, with its condition, for the agent', async () => {
        const described = await asEditor(request(app).get('/editing/describe').query({ ref: 'global:header' }));
        const announcement = described.body.fields.find((field: { path: string }) => field.path === 'announcement');
        expect(announcement).toMatchObject({
            required: true,
            condition: {
                field: 'showAnnouncement',
                is: true,
            },
        });
        expect(announcement).not.toHaveProperty('hidden');
        expect(announcement.description).toContain("Shown only while 'showAnnouncement' is true.");
    });

    it('publishes once the field is hidden, and keeps the value it holds', async () => {
        await asEditor(request(app).patch('/editing/globals/header/draft')).send({
            changes: {
                announcement: 'Orders before noon ship today',
            },
        });
        await asEditor(request(app).patch('/editing/globals/header/draft')).send({
            changes: {
                showAnnouncement: false,
            },
        });
        const described = await asEditor(request(app).get('/editing/describe').query({ ref: 'global:header' }));
        expect(described.body.fields.find((field: { path: string }) => field.path === 'announcement')).toMatchObject({
            hidden: true,
            value: 'Orders before noon ship today',
        });
        const published = await asEditor(request(app).post('/editing/globals/header/publish')).send({});
        expect(published.status).toBe(200);
        expect(published.body.content).toEqual({
            showAnnouncement: false,
            announcement: 'Orders before noon ship today',
        });
    });

    it('publishes a hidden required field left empty', async () => {
        await asEditor(request(app).patch('/editing/globals/header/draft')).send({
            changes: {
                announcement: null,
            },
        });
        const published = await asEditor(request(app).post('/editing/globals/header/publish')).send({});
        expect(published.status).toBe(200);
        expect(published.body.content).toEqual({
            showAnnouncement: false,
        });
    });
});
