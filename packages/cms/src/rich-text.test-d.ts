import { expectTypeOf, test } from 'vitest';
import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { defineBlock } from './block.js';
import { defineCollection } from './definitions.js';
import { richText } from './rich-text.js';
import { RichText, type RichTextBlockNode } from './next.js';
import type { Output } from './output.js';

const ArticleId = Kizuna.brand('ArticleId', z.string());

const ArticleBlockSchema = defineBlock({
    name: 'article',
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
            schema: z.array(z.string()).min(1),
        },
    ],
});

const Newsletters = defineCollection({
    name: 'newsletters',
    id: Kizuna.brand('NewsletterId', z.string()),
    fields: [
        {
            name: 'body',
            schema: richText({
                blocks: [ArticleBlockSchema, ProductBlockSchema],
            }),
        },
    ],
});

type Body = Output<typeof Newsletters>['body'];

test("a block node carries its name under _type, a _key and the block's fields", () => {
    expectTypeOf<RichTextBlockNode<Body>['_type']>().toEqualTypeOf<'article' | 'product'>();
    expectTypeOf<Extract<RichTextBlockNode<Body>, { _type: 'article' }>['article']>().toEqualTypeOf<z.output<typeof ArticleId>>();
    expectTypeOf<Extract<RichTextBlockNode<Body>, { _type: 'product' }>>().toEqualTypeOf<{
        _type: 'product';
        _key: string;
        products: string[];
    }>();
});

test('a text block narrows by _type beside the blocks', () => {
    expectTypeOf<Extract<Body[number], { _type: 'block' }>['style']>().toEqualTypeOf<'normal' | 'h2' | 'h3' | 'h4' | 'blockquote'>();
});

test('RichText asks for a component for every block the value holds', () => {
    const body = [] as unknown as Body;
    RichText({
        value: body,
        blocks: {
            article: (props) => props.article,
            product: (props) => props.products.join(', '),
        },
    });
    RichText({
        value: body,
        // @ts-expect-error The product block has no component.
        blocks: {
            article: (props) => props.article,
        },
    });
    // @ts-expect-error A value with blocks names their components.
    RichText({
        value: body,
    });
});
