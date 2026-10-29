import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { blocks, defineBlock } from './block.js';
import { ImageSchema } from './image.js';
import { definePage } from './page.js';
import type { Output } from './output.js';
import type { ResolvedImage } from './image.js';

const StatementBlockSchema = defineBlock({
    name: 'statement',
    fields: [
        {
            name: 'text',
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
            schema: z.string().max(120).optional(),
        },
    ],
});

const FrontPage = definePage({
    name: 'frontPage',
    fields: [
        {
            name: 'sections',
            schema: blocks([StatementBlockSchema, MediaBlockSchema]).max(12),
        },
    ],
});

test('a block keeps its name as a literal', () => {
    expectTypeOf(MediaBlockSchema).toHaveProperty('shape');
    expectTypeOf<z.output<typeof StatementBlockSchema>>().toEqualTypeOf<{
        text: string;
    }>();
});

test('an item of a block list narrows by its block', () => {
    type Section = Output<typeof FrontPage>['sections'][number];
    expectTypeOf<Section['block']>().toEqualTypeOf<'statement' | 'media'>();
    const read = (section: Section): string | ResolvedImage | undefined => {
        switch (section.block) {
            case 'statement':
                expectTypeOf(section.text).toEqualTypeOf<string>();
                return section.text;
            case 'media':
                expectTypeOf(section.image).toEqualTypeOf<ResolvedImage>();
                return section.image;
        }
    };
    expectTypeOf(read).toBeFunction();
});

test('a block list takes only blocks', () => {
    // @ts-expect-error a plain object schema is no block
    blocks([z.object({ text: z.string() })]);
    // @ts-expect-error an optional block is no block
    blocks([StatementBlockSchema.optional()]);
});
