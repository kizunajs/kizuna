import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { blocks, defineBlock, readBlocks } from './block.js';
import { describeFields, refsOf } from './content.js';
import { resolvedSchema } from './content-schema.js';
import { ImageSchema } from './image.js';
import { resolveContent } from './media/resolve.js';
import { definePage } from './page.js';
import { cms } from './provider.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';
import type { MediaRecord } from './media/media.js';

const ArticleId = Kizuna.brand('ArticleId', z.string());

const StatementBlockSchema = defineBlock({
    name: 'statement',
    label: 'Statement',
    description: 'One large sentence.',
    fields: [
        {
            name: 'text',
            label: 'Sentence',
            schema: z.string().max(140),
        },
    ],
});

const MediaBlockSchema = defineBlock({
    name: 'media',
    fields: [
        {
            name: 'image',
            schema: ImageSchema,
        },
        {
            name: 'caption',
            schema: z.string().max(120).optional().describe('Set small under the photo.'),
        },
    ],
});

const ArchiveBlockSchema = defineBlock({
    name: 'archive',
    label: 'Journal',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
        {
            name: 'articles',
            schema: z.array(ArticleId).max(3),
        },
    ],
});

const SectionsSchema = blocks([StatementBlockSchema, MediaBlockSchema, ArchiveBlockSchema]).max(3);

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
        {
            name: 'sections',
            schema: SectionsSchema.default([]),
        },
    ],
});

describe('blocks()', () => {
    it('takes each item as one of its blocks, by the name under block', () => {
        expect(
            SectionsSchema.safeParse([
                {
                    block: 'statement',
                    text: 'Plants that stay with you',
                },
                {
                    block: 'archive',
                    heading: 'From the journal',
                    articles: [],
                },
            ]).success
        ).toBe(true);
        const unknown = SectionsSchema.safeParse([
            {
                block: 'quote',
                text: 'Lovely ferns',
            },
        ]);
        expect(unknown.error?.issues[0]).toMatchObject({
            code: 'invalid_union',
            path: [0, 'block'],
        });
    });

    it("holds each block's own limits and the list's", () => {
        expect(
            SectionsSchema.safeParse([
                {
                    block: 'statement',
                    text: 'x'.repeat(141),
                },
            ]).error?.issues[0]?.path
        ).toEqual([0, 'text']);
        const statement = {
            block: 'statement',
            text: 'Plants',
        };
        expect(SectionsSchema.safeParse([statement, statement, statement, statement]).success).toBe(false);
    });

    it('reads its blocks back through .max(), .default() and .optional()', () => {
        expect(readBlocks(SectionsSchema.default([]).optional())?.map((block) => block.name)).toEqual(['statement', 'media', 'archive']);
        expect(readBlocks(z.array(StatementBlockSchema))).toBeUndefined();
    });

    it('keeps the discriminator in the schema a reader answers with', () => {
        expect(
            resolvedSchema(SectionsSchema).safeParse([
                {
                    block: 'media',
                    image: {
                        id: 'media_1',
                        url: '/media/media_1',
                        alt: 'Ferns',
                        width: 1200,
                        height: 800,
                    },
                },
            ]).success
        ).toBe(true);
        const element = (resolvedSchema(SectionsSchema) as z.ZodArray).element as unknown as { _zod: { def: { discriminator?: string } } };
        expect(element._zod.def.discriminator).toBe('block');
    });

    it('throws when it is given no blocks, or one twice', () => {
        // @ts-expect-error a list holds at least one block
        expect(() => blocks([])).toThrow('blocks() lists no blocks');
        expect(() => blocks([StatementBlockSchema, StatementBlockSchema])).toThrow("blocks() lists the block 'statement' twice.");
    });

    it('throws on a schema defineBlock did not make', () => {
        expect(() =>
            blocks([
                StatementBlockSchema,
                // @ts-expect-error a plain object is no block
                z.object({
                    text: z.string(),
                }),
            ])
        ).toThrow('item 2 is something else');
    });

    it('throws on a block with a field named block', () => {
        const Tagged = defineBlock({
            name: 'tagged',
            fields: [
                {
                    name: 'block',
                    schema: z.string(),
                },
            ],
        });
        expect(() => blocks([Tagged])).toThrow("which has a field named 'block'");
    });

    it('throws on a block whose field declares auth or readOnly', () => {
        const Guarded = defineBlock({
            name: 'guarded',
            fields: [
                {
                    name: 'price',
                    schema: z.string(),
                    auth: {
                        roles: 'admin',
                    },
                },
            ],
        });
        expect(() => blocks([Guarded])).toThrow("the block 'guarded', whose field 'price' declares auth");
        const Fixed = defineBlock({
            name: 'fixed',
            fields: [
                {
                    name: 'note',
                    schema: z.string(),
                    readOnly: true,
                },
            ],
        });
        expect(() => blocks([Fixed])).toThrow('declares readOnly');
    });
});

describe('a list of blocks in a document', () => {
    it('describes each block with its label, description and fields', () => {
        const sections = describeFields(FrontPage).find((field) => field.name === 'sections');
        expect(
            sections?.blocks?.map((block) => ({
                name: block.name,
                label: block.label,
                description: block.description,
                fields: block.fields.map((field) => [field.path, field.label, field.description, field.required]),
            }))
        ).toEqual([
            {
                name: 'statement',
                label: 'Statement',
                description: 'One large sentence.',
                fields: [['text', 'Sentence', undefined, true]],
            },
            {
                name: 'media',
                label: undefined,
                description: undefined,
                fields: [
                    ['image', undefined, undefined, true],
                    ['caption', undefined, 'Set small under the photo.', false],
                ],
            },
            {
                name: 'archive',
                label: 'Journal',
                description: undefined,
                fields: [
                    ['heading', undefined, undefined, true],
                    ['articles', undefined, undefined, true],
                ],
            },
        ]);
    });

    it("records the ids an item holds under its own block's fields", () => {
        expect(
            refsOf(FrontPage, {
                heading: 'Hagen',
                sections: [
                    {
                        block: 'statement',
                        text: 'Plants',
                    },
                    {
                        block: 'archive',
                        heading: 'From the journal',
                        articles: ['article_1'],
                    },
                ],
            })
        ).toEqual([
            {
                brand: 'ArticleId',
                refId: 'article_1',
                fieldPath: 'sections.1.articles.0',
            },
        ]);
    });

    it('resolves the image of an item still being filled in', () => {
        const media = new Map<string, MediaRecord>([
            [
                'media_1',
                {
                    id: 'media_1',
                    width: 1200,
                    height: 800,
                } as MediaRecord,
            ],
        ]);
        const resolved = resolveContent(
            FrontPage,
            {
                sections: [
                    {
                        block: 'media',
                        image: {
                            id: 'media_1',
                            alt: 'Ferns',
                        },
                        caption: 'x'.repeat(200),
                    },
                ],
            },
            media,
            (id) => `/media/${id}`
        );
        expect((resolved['sections'] as Array<{ image: { url: string } }>)[0]?.image.url).toBe('/media/media_1');
    });
});

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

const pglite = new PGlite();
const db = drizzle(pglite);

const app = express();
defineConfig({
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db,
        pages: {
            frontPage: {
                path: '/',
                page: FrontPage,
            },
        },
        auth: {
            identity: 'editor',
        },
        media: {
            storage: memoryMediaStorage(),
        },
        appDir: 'src/__fixtures__/app',
    }),
}).api.mount(app);

const asEditor = (test: request.Test) => test.set('authorization', 'Bearer editor-token');

const save = (changes: Record<string, unknown>) =>
    asEditor(request(app).patch('/editing/pages/frontPage/draft')).send({
        changes,
    });

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
    const saved = await save({
        heading: 'Hagen',
        sections: [
            {
                block: 'statement',
                text: 'Plants that stay with you',
            },
        ],
    });
    expect(saved.status).toBe(200);
});

afterAll(async () => {
    await pglite.close();
});

describe('saving a list of blocks', () => {
    it('adds an item at the next index, as the agent does', async () => {
        const saved = await save({
            'sections.1': {
                block: 'archive',
                heading: 'From the journal',
                articles: [],
            },
        });
        expect(saved.status).toBe(200);
        expect(saved.body.complete).toBe(true);
        expect(saved.body.content.sections.map((section: { block: string }) => section.block)).toEqual(['statement', 'archive']);
    });

    it('keeps an item added before its fields are filled, and leaves the draft incomplete', async () => {
        const saved = await save({
            'sections.1': {
                block: 'archive',
            },
        });
        expect(saved.status).toBe(200);
        expect(saved.body.complete).toBe(false);
    });

    it('refuses an item naming a block the list does not hold, with a 422', async () => {
        const refused = await save({
            'sections.1': {
                block: 'quote',
                text: 'Lovely ferns',
            },
        });
        expect(refused.status).toBe(422);
        expect(refused.body.errors[0]).toMatchObject({
            path: ['sections', '1', 'block'],
        });
    });

    it('describes the blocks to the editor and the agent', async () => {
        const described = await asEditor(request(app).get('/editing/describe')).query({
            ref: 'page:frontPage',
        });
        expect(described.status).toBe(200);
        const sections = described.body.fields.find((field: { path: string }) => field.path === 'sections');
        expect(sections.blocks[0]).toEqual({
            name: 'statement',
            label: 'Statement',
            description: 'One large sentence.',
            fields: [
                {
                    name: 'text',
                    label: 'Sentence',
                    required: true,
                },
            ],
        });
        expect(sections.description).toContain("its name under 'block': 'statement', 'media', 'archive'");
        expect(sections.schema.items.oneOf[0].properties.block).toEqual({
            type: 'string',
            const: 'statement',
        });
        expect(sections.schema.maxItems).toBe(3);
    });
});
