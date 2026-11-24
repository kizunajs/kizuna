import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { definePage } from './page.js';
import { RichTextSchema } from './rich-text.js';
import { mergedRichText, normalisedText, richTextFieldsOf, topicMatchOf, unsaidNodes, withLinkAt, type RichTextNode } from './seo-fixes.js';

const block = (key: string, text: string, extra: Record<string, unknown> = {}): RichTextNode => ({
    _type: 'block',
    _key: key,
    style: 'normal',
    markDefs: [],
    children: [
        {
            _type: 'span',
            _key: `${key}-span`,
            text,
            marks: [],
        },
    ],
    ...extra,
});

describe('normalisedText', () => {
    it('reads case, punctuation and spacing as the same', () => {
        expect(normalisedText('  Water weekly,  in WINTER! ')).toBe(normalisedText('water weekly in winter'));
    });
});

describe('richTextFieldsOf', () => {
    it('names the rich text fields, optional ones too, and nothing else', () => {
        const page = definePage({
            name: 'tasksPage',
            fields: [
                {
                    name: 'title',
                    schema: z.string(),
                },
                {
                    name: 'intro',
                    schema: RichTextSchema,
                },
                {
                    name: 'body',
                    schema: RichTextSchema.optional(),
                },
            ],
        });
        expect(richTextFieldsOf(page)).toEqual(['intro', 'body']);
    });
});

describe('unsaidNodes', () => {
    it('keeps the paragraphs and blocks the winner does not say, compared by their words', () => {
        const winner = [block('one', 'Tasks keep a team on track.'), block('two', 'Share a list with your team.')];
        const other = [
            block('a', 'tasks keep a team on track'),
            block('b', 'Set a due date on each task.'),
            block('c', ''),
            {
                _type: 'image',
                _key: 'd',
                image: {
                    id: 'board',
                },
            },
        ];
        expect(unsaidNodes(winner, other).map((node) => node['_key'])).toEqual(['b', 'd']);
    });

    it('counts an image the winner holds as said', () => {
        const image = (key: string): RichTextNode => ({
            _type: 'image',
            _key: key,
            image: {
                id: 'board',
            },
        });
        expect(unsaidNodes([image('one')], [image('two')])).toEqual([]);
    });
});

describe('mergedRichText', () => {
    it("puts each page's parts after the winner's, under a heading with its title and with new keys", () => {
        const merged = mergedRichText(
            [block('one', 'Tasks keep a team on track.')],
            [
                {
                    title: 'Due dates',
                    nodes: [block('one', 'Set a due date on each task.')],
                },
                {
                    title: 'Nothing new',
                    nodes: [],
                },
            ]
        );
        expect(merged).toHaveLength(3);
        expect(merged[0]?.['_key']).toBe('one');
        expect(merged[1]).toMatchObject({
            _type: 'block',
            style: 'h2',
            children: [
                {
                    text: 'Due dates',
                },
            ],
        });
        expect(merged[2]).toMatchObject({
            children: [
                {
                    text: 'Set a due date on each task.',
                },
            ],
        });
        expect(merged[2]?.['_key']).not.toBe('one');
        expect(RichTextSchema.safeParse(merged).success).toBe(true);
    });
});

describe('topicMatchOf', () => {
    it('finds the first phrase as whole words, with the sentence around it', () => {
        const match = topicMatchOf(
            [
                {
                    field: 'body',
                    nodes: [
                        block('heading', 'Shared tasks', {
                            style: 'h2',
                        }),
                        block('one', 'Plan the week first. A shared tasks list keeps everyone on track. Then start.'),
                    ],
                },
            ],
            ['shared tasks list', 'Tasks']
        );
        expect(match).toEqual({
            field: 'body',
            block: 'one',
            start: 23,
            end: 40,
            phrase: 'shared tasks list',
            sentence: 'A shared tasks list keeps everyone on track.',
            at: 2,
        });
    });

    it('falls back to the next phrase, and skips words that are part of another word or linked already', () => {
        const linked: RichTextNode = {
            _type: 'block',
            _key: 'linked',
            style: 'normal',
            markDefs: [
                {
                    _type: 'link',
                    _key: 'there',
                    href: '/tasks',
                },
            ],
            children: [
                {
                    _type: 'span',
                    _key: 'only',
                    text: 'Tasks',
                    marks: ['there'],
                },
            ],
        };
        const match = topicMatchOf(
            [
                {
                    field: 'body',
                    nodes: [linked, block('one', 'Subtasks help. Tasks help more.')],
                },
            ],
            ['shared tasks list', 'Tasks']
        );
        expect(match).toMatchObject({
            block: 'one',
            start: 15,
            phrase: 'Tasks',
            sentence: 'Tasks help more.',
            at: 0,
        });
    });

    it('answers nothing when no paragraph says a phrase', () => {
        expect(
            topicMatchOf(
                [
                    {
                        field: 'body',
                        nodes: [block('one', 'Events start at nine.')],
                    },
                ],
                ['Tasks']
            )
        ).toBeUndefined();
    });
});

describe('withLinkAt', () => {
    it('links only the matched words, splitting the spans at both ends, across marks', () => {
        const node: RichTextNode = {
            _type: 'block',
            _key: 'one',
            style: 'normal',
            markDefs: [],
            children: [
                {
                    _type: 'span',
                    _key: 'first',
                    text: 'Keep a shared ',
                    marks: [],
                },
                {
                    _type: 'span',
                    _key: 'second',
                    text: 'tasks list for the team.',
                    marks: ['strong'],
                },
            ],
        };
        const linked = withLinkAt(
            [node],
            {
                block: 'one',
                start: 7,
                end: 24,
                phrase: 'shared tasks list',
            },
            'page:tasksPage'
        )!;
        const result = linked[0]!;
        const mark = (result['markDefs'] as Array<Record<string, unknown>>)[0]!;
        expect(mark).toMatchObject({
            _type: 'link',
            ref: 'page:tasksPage',
        });
        const children = result['children'] as Array<{ _key: string; text: string; marks: string[] }>;
        expect(children.map((span) => [span.text, span.marks])).toEqual([
            ['Keep a ', []],
            ['shared ', [mark['_key']]],
            ['tasks list', ['strong', mark['_key']]],
            [' for the team.', ['strong']],
        ]);
        expect(new Set(children.map((span) => span._key)).size).toBe(children.length);
        expect(RichTextSchema.safeParse(linked).success).toBe(true);
    });

    it('refuses words that changed since they were found', () => {
        expect(
            withLinkAt(
                [block('one', 'Events start at nine.')],
                {
                    block: 'one',
                    start: 0,
                    end: 5,
                    phrase: 'Tasks',
                },
                'page:tasksPage'
            )
        ).toBeUndefined();
    });
});
