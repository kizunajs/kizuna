import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { blocks, defineBlock } from '../block.js';
import { blockListsIn, movedBlock, moveTargetsOf } from './block-moves.js';
import type { JsonSchema } from './schema.js';

const StatementBlockSchema = defineBlock({
    name: 'statement',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});

const ShopListBlockSchema = defineBlock({
    name: 'shopList',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
    ],
});

const ColumnsBlockSchema = defineBlock({
    name: 'columns',
    fields: [
        {
            name: 'heading',
            schema: z.string(),
        },
        {
            name: 'left',
            schema: blocks([StatementBlockSchema]),
        },
        {
            name: 'right',
            schema: blocks([StatementBlockSchema]),
        },
    ],
});

const sections = blocks([StatementBlockSchema, ShopListBlockSchema, ColumnsBlockSchema]);
const schema = z.toJSONSchema(sections, {
    unrepresentable: 'any',
    reused: 'inline',
    io: 'input',
}) as JsonSchema;

const frontPage = [
    {
        block: 'statement',
        heading: 'Fra gartnere vi kjenner',
    },
    {
        block: 'columns',
        heading: 'Stell som varer',
        left: [
            {
                block: 'statement',
                heading: 'Stellekort med hver plante',
            },
        ],
        right: [],
    },
    {
        block: 'shopList',
        heading: 'Butikkene våre',
    },
    {
        block: 'statement',
        heading: 'Levert neste dag',
    },
];

describe('moving a block between lists', () => {
    const lists = blockListsIn(frontPage, schema, schema, 'Sections');

    it('finds every list of blocks in the field, each named after the block holding it', () => {
        expect(lists.map((list) => [list.path.join('.'), list.title, list.detail ?? ''])).toEqual([
            ['', 'Sections', ''],
            ['1.left', 'Stell som varer', 'Left'],
            ['1.right', 'Stell som varer', 'Right'],
        ]);
    });

    it('offers the lists that take the block, outside the block itself', () => {
        expect(moveTargetsOf(lists, [], 3, 'statement').map((list) => list.path.join('.'))).toEqual(['1.left', '1.right']);
        expect(moveTargetsOf(lists, [], 2, 'shopList')).toEqual([]);
        expect(moveTargetsOf(lists, [], 1, 'columns')).toEqual([]);
        expect(moveTargetsOf(lists, [1, 'left'], 0, 'statement').map((list) => list.path.join('.'))).toEqual(['', '1.right']);
    });

    it('moves a block to the end of another list as one change to the field', () => {
        const moved = movedBlock(frontPage, [], 3, [1, 'left']);
        expect(moved).toHaveLength(3);
        expect((moved[1] as { left: Array<{ heading: string }> }).left.map((block) => block.heading)).toEqual([
            'Stellekort med hver plante',
            'Levert neste dag',
        ]);
        expect(frontPage).toHaveLength(4);
        const back = movedBlock(moved, [1, 'left'], 0, []);
        expect((back.at(-1) as { heading: string }).heading).toBe('Stellekort med hver plante');
    });
});
