import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MockLanguageModelV4 } from 'ai/test';
import { Kizuna } from 'kizunajs';
import { blocks, defineBlock } from './block.js';
import { ImageSchema } from './image.js';
import { RichTextSchema } from './rich-text.js';
import { slugOf, TranslationError, translateFields } from './translate.js';
import type { FieldList } from './field.js';

const usage = {
    inputTokens: {
        total: 10,
        noCache: 10,
        cacheRead: undefined,
        cacheWrite: undefined,
    },
    outputTokens: {
        total: 20,
        text: 20,
        reasoning: undefined,
    },
};

type CallOptions = Parameters<MockLanguageModelV4['doGenerate']>[0];

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;

const answer = (text: string): GenerateResult => ({
    content: [
        {
            type: 'text',
            text,
        },
    ],
    finishReason: {
        unified: 'stop',
        raw: undefined,
    },
    usage,
    warnings: [],
});

const asked = (options: CallOptions): Record<string, string> => {
    const message = options.prompt.find((candidate) => candidate.role === 'user');
    const part = message?.role === 'user' ? message.content.find((candidate) => candidate.type === 'text') : undefined;
    return JSON.parse(part?.type === 'text' ? part.text : '{}');
};

const NORWEGIAN: Record<string, string> = {
    'Plants for a dark office': 'Planter for et mørkt kontor',
    'Ferns ': 'Bregner ',
    'like shade.': 'liker skygge.',
    'A fern on a desk': 'En bregne på en pult',
    'Visit us': 'Besøk oss',
    'Opening hours': 'Åpningstider',
};

const translator = () => {
    const calls: Record<string, string>[] = [];
    const model = new MockLanguageModelV4({
        doGenerate: async (options) => {
            const texts = asked(options);
            calls.push(texts);
            return answer(
                JSON.stringify(Object.fromEntries(Object.entries(texts).map(([key, text]) => [key, NORWEGIAN[text] ?? `[nb] ${text}`])))
            );
        },
    });
    return {
        model,
        calls,
    };
};

const translate = (model: MockLanguageModelV4, fields: FieldList, values: Record<string, unknown>) =>
    translateFields({
        model,
        fields,
        values,
        from: 'en',
        to: 'nb',
    });

describe('translateFields', () => {
    it('translates text and leaves numbers, enums, ids and strings with a pattern alone', async () => {
        const { model, calls } = translator();
        const fields: FieldList = [
            {
                name: 'heading',
                schema: z.string().max(60),
            },
            {
                name: 'sku',
                schema: z.string().regex(/^[A-Z0-9-]+$/),
            },
            {
                name: 'price',
                schema: z.number(),
            },
            {
                name: 'category',
                schema: z.enum(['plants', 'pots']),
            },
            {
                name: 'office',
                schema: Kizuna.brand('OfficeId', z.string()),
            },
        ];
        const translated = await translate(model, fields, {
            heading: 'Plants for a dark office',
            sku: 'PLANT-DARK-01',
            price: 120,
            category: 'plants',
            office: 'office-oslo',
        });
        expect(translated).toEqual({
            heading: 'Planter for et mørkt kontor',
        });
        expect(calls).toEqual([
            {
                t0: 'Plants for a dark office',
            },
        ]);
    });

    it('makes the slug from the translated title', async () => {
        const { model, calls } = translator();
        const translated = await translate(
            model,
            [
                {
                    name: 'title',
                    schema: z.string(),
                },
                {
                    name: 'slug',
                    schema: z.string().regex(/^[a-z0-9-]+$/),
                },
            ],
            {
                title: 'Plants for a dark office',
                slug: 'plants-for-a-dark-office',
            }
        );
        expect(translated).toEqual({
            title: 'Planter for et mørkt kontor',
            slug: 'planter-for-et-morkt-kontor',
        });
        expect(calls).toEqual([
            {
                t0: 'Plants for a dark office',
            },
        ]);
    });

    it('keeps the source slug when the slug made from the title does not fit', async () => {
        const { model } = translator();
        const translated = await translate(
            model,
            [
                {
                    name: 'title',
                    schema: z.string(),
                },
                {
                    name: 'slug',
                    schema: z
                        .string()
                        .regex(/^[a-z0-9-]+$/)
                        .max(12),
                },
            ],
            {
                title: 'Plants for a dark office',
                slug: 'dark-office',
            }
        );
        expect(translated).toEqual({
            title: 'Planter for et mørkt kontor',
        });
    });

    it('keeps the structure of rich text and translates only its spans and image alt text', async () => {
        const { model } = translator();
        const body = [
            {
                _type: 'block',
                _key: 'b1',
                style: 'normal',
                markDefs: [
                    {
                        _type: 'link',
                        _key: 'l1',
                        href: '/ferns',
                    },
                ],
                children: [
                    {
                        _type: 'span',
                        _key: 's1',
                        text: 'Ferns ',
                        marks: ['strong', 'l1'],
                    },
                    {
                        _type: 'span',
                        _key: 's2',
                        text: 'like shade.',
                        marks: [],
                    },
                ],
            },
            {
                _type: 'image',
                _key: 'i1',
                image: {
                    id: 'media-1',
                    alt: 'A fern on a desk',
                },
            },
        ];
        const translated = await translate(
            model,
            [
                {
                    name: 'body',
                    schema: RichTextSchema,
                },
            ],
            {
                body,
            }
        );
        expect(translated).toEqual({
            body: [
                {
                    ...body[0],
                    children: [
                        {
                            _type: 'span',
                            _key: 's1',
                            text: 'Bregner ',
                            marks: ['strong', 'l1'],
                        },
                        {
                            _type: 'span',
                            _key: 's2',
                            text: 'liker skygge.',
                            marks: [],
                        },
                    ],
                },
                {
                    _type: 'image',
                    _key: 'i1',
                    image: {
                        id: 'media-1',
                        alt: 'En bregne på en pult',
                    },
                },
            ],
        });
    });

    it('translates inside blocks, keeping each block and its order', async () => {
        const { model } = translator();
        const HeroBlockSchema = defineBlock({
            name: 'hero',
            fields: [
                {
                    name: 'heading',
                    schema: z.string(),
                },
                {
                    name: 'image',
                    schema: ImageSchema,
                },
            ],
        });
        const HoursBlockSchema = defineBlock({
            name: 'hours',
            fields: [
                {
                    name: 'title',
                    schema: z.string(),
                },
                {
                    name: 'code',
                    schema: z.string(),
                    localized: false,
                },
                {
                    name: 'opens',
                    schema: z.int(),
                },
            ],
        });
        const sections = [
            {
                block: 'hero',
                heading: 'Visit us',
                image: {
                    id: 'media-2',
                    alt: '',
                },
            },
            {
                block: 'hours',
                title: 'Opening hours',
                code: 'HOURS',
                opens: 9,
            },
        ];
        const translated = await translate(
            model,
            [
                {
                    name: 'sections',
                    schema: blocks([HeroBlockSchema, HoursBlockSchema]),
                },
            ],
            {
                sections,
            }
        );
        expect(translated).toEqual({
            sections: [
                {
                    block: 'hero',
                    heading: 'Besøk oss',
                    image: {
                        id: 'media-2',
                        alt: '',
                    },
                },
                {
                    block: 'hours',
                    title: 'Åpningstider',
                    code: 'HOURS',
                    opens: 9,
                },
            ],
        });
    });

    it('leaves out a field marked localized: false', async () => {
        const { model, calls } = translator();
        const translated = await translate(
            model,
            [
                {
                    name: 'productCode',
                    schema: z.string().max(20),
                    localized: false,
                },
            ],
            {
                productCode: 'OAK-DESK',
            }
        );
        expect(translated).toEqual({});
        expect(calls).toEqual([]);
    });

    it('throws a TranslationError when the model answers with something the fields cannot hold', async () => {
        const model = new MockLanguageModelV4({
            doGenerate: async () =>
                answer(
                    JSON.stringify({
                        t0: 'Planter for et mørkt kontor, med bregner, monstera og andre planter som tåler lite lys',
                    })
                ),
        });
        const values = {
            heading: 'Plants for a dark office',
        };
        await expect(
            translate(
                model,
                [
                    {
                        name: 'heading',
                        schema: z.string().max(40),
                    },
                ],
                values
            )
        ).rejects.toThrow(TranslationError);
        expect(values).toEqual({
            heading: 'Plants for a dark office',
        });
    });

    it('throws a TranslationError when the model leaves a value out', async () => {
        const model = new MockLanguageModelV4({
            doGenerate: async () => answer('{}'),
        });
        await expect(
            translate(
                model,
                [
                    {
                        name: 'heading',
                        schema: z.string(),
                    },
                ],
                {
                    heading: 'Plants for a dark office',
                }
            )
        ).rejects.toThrow("The model's translation from en to nb does not fit the fields.");
    });
});

describe('slugOf', () => {
    it('writes letters without their accents, and joins words with hyphens', () => {
        expect(slugOf('Åpningstider på Grünerløkka')).toBe('apningstider-pa-grunerlokka');
        expect(slugOf('  Café & Bar, 24/7 ')).toBe('cafe-bar-24-7');
    });
});
