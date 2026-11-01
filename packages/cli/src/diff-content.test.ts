import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineConfig } from 'kizunajs';
import { defineContentProvider, definePlugin } from 'kizunajs/plugin';
import { diffApis, type Change } from './diff-apis.js';
import { toSnapshot } from './snapshot.js';

const contentPlugin = definePlugin({
    slug: 'pages',
    setup: () => ({}),
});

/**
 * An api whose content is one front page with the schema and migrate step
 * given.
 */
const apiWith = (documents: Array<{ ref: string; kind?: 'page' | 'global' | 'collection'; schema: z.ZodType; migration?: number }>) =>
    defineConfig({
        content: defineContentProvider({
            plugin: contentPlugin(),
            routes: {},
            reader: () => undefined,
            documents: () =>
                documents.map((document) => ({
                    ref: document.ref,
                    kind: document.kind ?? 'page',
                    name: document.ref.slice(document.ref.indexOf(':') + 1),
                    schema: document.schema,
                    migration: document.migration ?? 0,
                })),
        }),
    }).api;

const before = apiWith([
    {
        ref: 'page:frontPage',
        schema: z.object({
            heading: z.string(),
        }),
    },
]);

const summaries = (changes: Change[]) => changes.map((change) => `${change.level} ${change.summary}`);

describe('content', () => {
    it('records every document with its schema and migrate step', () => {
        expect(toSnapshot(before).content).toEqual({
            'page:frontPage': {
                kind: 'page',
                migration: 0,
                schema: {
                    kind: 'object',
                    fields: {
                        heading: {
                            optional: false,
                            schema: {
                                kind: 'string',
                            },
                        },
                    },
                },
            },
        });
    });

    it('breaks on a required field stored content lacks', () => {
        const after = apiWith([
            {
                ref: 'page:frontPage',
                schema: z.object({
                    heading: z.string(),
                    subheading: z.string(),
                }),
            },
        ]);
        expect(summaries(diffApis(before, after))).toEqual([
            'breaking page:frontPage subheading is now required, with no default and no migrate step',
        ]);
    });

    it('lets a default or a migrate step settle a new field', () => {
        const defaulted = apiWith([
            {
                ref: 'page:frontPage',
                schema: z.object({
                    heading: z.string(),
                    subheading: z.string().default(''),
                }),
            },
        ]);
        expect(diffApis(before, defaulted)).toEqual([]);
        const migrated = apiWith([
            {
                ref: 'page:frontPage',
                schema: z.object({
                    heading: z.string(),
                    subheading: z.string(),
                }),
                migration: 1,
            },
        ]);
        expect(summaries(diffApis(before, migrated))).toEqual(['changed page:frontPage has a new migrate step']);
    });

    it('breaks on a type stored content no longer has', () => {
        const after = apiWith([
            {
                ref: 'page:frontPage',
                schema: z.object({
                    heading: z.number(),
                }),
            },
        ]);
        expect(summaries(diffApis(before, after))).toEqual([
            'breaking page:frontPage heading is number instead of string, with no migrate step',
        ]);
    });

    it('breaks on a document that is gone, and adds one that arrived', () => {
        const after = apiWith([
            {
                ref: 'page:plansPage',
                schema: z.object({
                    heading: z.string(),
                }),
            },
        ]);
        expect(summaries(diffApis(before, after))).toEqual(['breaking page:frontPage is gone', 'added page:plansPage added']);
    });

    it('points a gone page at rename-page, and a gone collection at nothing', () => {
        const withArticles = apiWith([
            {
                ref: 'page:frontPage',
                schema: z.object({
                    heading: z.string(),
                }),
            },
            {
                ref: 'collection:articles',
                kind: 'collection',
                schema: z.object({
                    title: z.string(),
                }),
            },
        ]);
        const after = apiWith([]);
        expect(diffApis(withArticles, after).map((change) => `${change.key}: ${change.detail}`)).toEqual([
            'collection:articles: its stored content no longer shows anywhere',
            "page:frontPage: its stored content no longer shows anywhere; `kizuna cms rename-page` moves a renamed page's content",
        ]);
    });

    describe('a list of blocks', () => {
        const sectionsOf = (...options: [z.ZodObject, ...z.ZodObject[]]) =>
            apiWith([
                {
                    ref: 'page:frontPage',
                    schema: z.object({
                        sections: z.array(z.discriminatedUnion('block', options)),
                    }),
                },
            ]);
        const Statement = z.object({
            block: z.literal('statement'),
            text: z.string(),
        });
        const Media = z.object({
            block: z.literal('media'),
            caption: z.string().optional(),
        });
        const withBlocks = sectionsOf(Statement, Media);

        it('records each block under its name', () => {
            const schema = toSnapshot(withBlocks).content?.['page:frontPage']?.schema as {
                fields: Record<string, { schema: { element: { discriminator: string; options: Record<string, unknown> } } }>;
            };
            const element = schema.fields['sections']!.schema.element;
            expect(element.discriminator).toBe('block');
            expect(Object.keys(element.options)).toEqual(['statement', 'media']);
        });

        it('breaks on a block taken out of the list', () => {
            expect(summaries(diffApis(withBlocks, sectionsOf(Statement)))).toEqual([
                "breaking page:frontPage sections[] no longer accepts block 'media', with no migrate step",
            ]);
        });

        it('breaks on a field a block now requires, and adds a block quietly', () => {
            const after = sectionsOf(
                Statement,
                Media.extend({
                    caption: z.string(),
                }),
                z.object({
                    block: z.literal('quote'),
                    text: z.string(),
                })
            );
            expect(summaries(diffApis(withBlocks, after))).toEqual([
                'breaking page:frontPage sections[](media).caption is no longer optional, with no migrate step',
                "changed page:frontPage sections[] also accepts block 'quote'",
            ]);
        });
    });

    it('leaves a config without content out of the snapshot', () => {
        expect(toSnapshot(defineConfig({}).api).content).toBeUndefined();
    });
});
