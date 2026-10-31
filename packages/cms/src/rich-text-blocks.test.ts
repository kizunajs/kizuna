import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { defineConfig, Kizuna } from 'kizunajs';
import { expressAdapter } from '@kizunajs/express';
import { defineBlock } from './block.js';
import { describeFields, refsOf } from './content.js';
import { resolvedSchema } from './content-schema.js';
import { ImageSchema } from './image.js';
import { resolveContent } from './media/resolve.js';
import { definePage } from './page.js';
import { cms } from './provider.js';
import { memoryMediaStorage } from './media/storage.js';
import { DocumentStore } from './storage/store.js';
import { readRichTextBlocks, richText, RichTextSchema } from './rich-text.js';
import type { MediaRecord } from './media/media.js';

const ArticleId = Kizuna.brand('ArticleId', z.string());

const ProductId = Kizuna.brand('ProductId', z.string());

const ArticleBlockSchema = defineBlock({
    name: 'article',
    label: 'Article',
    description: 'A card for one article from the journal.',
    fields: [
        {
            name: 'article',
            schema: ArticleId,
        },
    ],
});

const ProductBlockSchema = defineBlock({
    name: 'product',
    fields: [
        {
            name: 'products',
            label: 'Plants',
            schema: z.array(ProductId).min(1).max(3),
        },
        {
            name: 'image',
            schema: ImageSchema.optional(),
        },
    ],
});

const BodySchema = richText({
    blocks: [ArticleBlockSchema, ProductBlockSchema],
});

const paragraph = {
    _type: 'block',
    _key: 'b1',
    style: 'normal',
    markDefs: [],
    children: [
        {
            _type: 'span',
            _key: 's1',
            text: 'New in this week.',
            marks: [],
        },
    ],
};

const NewsletterPage = definePage({
    name: 'newsletterPage',
    fields: [
        {
            name: 'body',
            schema: BodySchema,
        },
    ],
});

describe('richText()', () => {
    it('takes text with block nodes between the paragraphs', () => {
        const body = [
            paragraph,
            {
                _type: 'article',
                _key: 'a1',
                article: 'article_1',
            },
            {
                _type: 'product',
                _key: 'p1',
                products: ['product_1', 'product_2'],
            },
        ];
        expect(BodySchema.parse(body)).toEqual(body);
    });

    it("checks a block node against its block's fields", () => {
        expect(
            BodySchema.safeParse([
                {
                    _type: 'product',
                    _key: 'p1',
                    products: [],
                },
            ]).success
        ).toBe(false);
        expect(
            BodySchema.safeParse([
                {
                    _type: 'article',
                    _key: 'a1',
                },
            ]).success
        ).toBe(false);
    });

    it('refuses a node naming a block the field does not hold', () => {
        expect(
            BodySchema.safeParse([
                {
                    _type: 'quote',
                    _key: 'q1',
                    text: 'Lovely ferns',
                },
            ]).success
        ).toBe(false);
    });

    it('flags itself as rich text in JSON Schema, with an option for each block', () => {
        const json = z.toJSONSchema(BodySchema) as unknown as {
            'x-kizuna': string;
            description: string;
            items: {
                oneOf: Array<{
                    properties: Record<string, unknown>;
                }>;
            };
        };
        expect(json['x-kizuna']).toBe('rich-text');
        expect(json.description).toContain("_type naming its block ('article', 'product')");
        expect(json.items.oneOf.map((option) => option.properties['_type'])).toEqual([
            {
                type: 'string',
                const: 'block',
            },
            {
                type: 'string',
                const: 'image',
            },
            {
                type: 'string',
                const: 'article',
            },
            {
                type: 'string',
                const: 'product',
            },
        ]);
    });

    it('reads its blocks back through optional and describe', () => {
        expect(readRichTextBlocks(BodySchema.optional().describe('The issue.'))?.map((block) => block.name)).toEqual([
            'article',
            'product',
        ]);
        expect(readRichTextBlocks(RichTextSchema)).toBeUndefined();
    });

    it('throws on a block named like a node rich text keeps for itself', () => {
        const Image = defineBlock({
            name: 'image',
            fields: [
                {
                    name: 'caption',
                    schema: z.string(),
                },
            ],
        });
        expect(() =>
            richText({
                blocks: [Image],
            })
        ).toThrow("the block 'image', a name rich text keeps for its own nodes");
    });

    it('throws on a block listed twice', () => {
        expect(() =>
            richText({
                blocks: [ArticleBlockSchema, ArticleBlockSchema],
            })
        ).toThrow("lists the block 'article' twice");
    });

    it('throws on a block with a field named _key', () => {
        const Keyed = defineBlock({
            name: 'keyed',
            fields: [
                {
                    name: '_key',
                    schema: z.string(),
                },
            ],
        });
        expect(() =>
            richText({
                blocks: [Keyed],
            })
        ).toThrow("a field named '_key'");
    });

    it('throws on a block whose field declares auth', () => {
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
        expect(() =>
            richText({
                blocks: [Guarded],
            })
        ).toThrow("richText() holds the block 'guarded', whose field 'price' declares auth");
    });
});

describe('rich text with blocks in a document', () => {
    it('describes the blocks it may hold', () => {
        const body = describeFields(NewsletterPage).find((field) => field.name === 'body');
        expect(
            body?.blocks?.map((block) => ({
                name: block.name,
                label: block.label,
                fields: block.fields.map((field) => [field.path, field.label, field.required]),
            }))
        ).toEqual([
            {
                name: 'article',
                label: 'Article',
                fields: [['article', undefined, true]],
            },
            {
                name: 'product',
                label: undefined,
                fields: [
                    ['products', 'Plants', true],
                    ['image', undefined, false],
                ],
            },
        ]);
    });

    it('records the ids its blocks hold', () => {
        expect(
            refsOf(NewsletterPage, {
                body: [
                    paragraph,
                    {
                        _type: 'article',
                        _key: 'a1',
                        article: 'article_1',
                    },
                    {
                        _type: 'product',
                        _key: 'p1',
                        products: ['product_1'],
                    },
                ],
            })
        ).toEqual([
            {
                brand: 'ArticleId',
                refId: 'article_1',
                fieldPath: 'body.1.article',
            },
            {
                brand: 'ProductId',
                refId: 'product_1',
                fieldPath: 'body.2.products.0',
            },
        ]);
    });

    it('resolves the images inside its blocks', () => {
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
            NewsletterPage,
            {
                body: [
                    {
                        _type: 'product',
                        _key: 'p1',
                        products: ['product_1'],
                        image: {
                            id: 'media_1',
                            alt: 'Ferns',
                        },
                    },
                ],
            },
            media,
            (id) => `/media/${id}`
        );
        const body = resolved['body'] as Array<{ image: { url: string } }>;
        expect(body[0]?.image.url).toBe('/media/media_1');
        expect(resolvedSchema(BodySchema).safeParse(body).success).toBe(true);
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
    jobRunner: {
        mode: 'in-process',
    },
    adapter: expressAdapter(),
    auth: {
        identities: {
            editor,
        },
    },
    content: cms({
        db,
        pages: {
            newsletterPage: {
                path: '/newsletter',
                page: NewsletterPage,
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
    asEditor(request(app).patch('/editing/pages/newsletterPage/draft')).send({
        changes,
    });

beforeAll(async () => {
    await new DocumentStore(db).createTables();
});

beforeEach(async () => {
    await pglite.exec('delete from cms_refs; delete from cms_versions; delete from cms_documents;');
});

afterAll(async () => {
    await pglite.close();
});

describe('saving rich text with blocks, as the editing tools do', () => {
    it('saves block nodes and answers with them', async () => {
        const saved = await save({
            body: [
                paragraph,
                {
                    _type: 'article',
                    _key: 'a1',
                    article: 'article_1',
                },
            ],
        });
        expect(saved.status).toBe(200);
        expect(saved.body.complete).toBe(true);
        expect(saved.body.content.body[1]).toEqual({
            _type: 'article',
            _key: 'a1',
            article: 'article_1',
        });
    });

    it('keeps a block inserted before its fields are filled, and leaves the draft incomplete', async () => {
        const saved = await save({
            body: [
                {
                    _type: 'product',
                    _key: 'p1',
                },
            ],
        });
        expect(saved.status).toBe(200);
        expect(saved.body.complete).toBe(false);
    });

    it('describes the blocks to the editor and the agent', async () => {
        const described = await asEditor(request(app).get('/editing/describe')).query({
            ref: 'page:newsletterPage',
        });
        expect(described.status).toBe(200);
        const body = described.body.fields.find((field: { path: string }) => field.path === 'body');
        expect(body.blocks[0]).toEqual({
            name: 'article',
            label: 'Article',
            description: 'A card for one article from the journal.',
            fields: [
                {
                    name: 'article',
                    required: true,
                },
            ],
        });
        expect(body.description).toContain(
            "its name under '_type', a unique '_key', and that block's fields beside them: 'article', 'product'."
        );
        expect(body.schema.items.oneOf[2].properties._type).toEqual({
            type: 'string',
            const: 'article',
        });
    });
});
