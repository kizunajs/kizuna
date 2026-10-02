import { describe, expect, it } from 'vitest';
import { definePage } from './page.js';
import { resolveContent } from './media/resolve.js';
import { resolvedSchema } from './content-schema.js';
import { decodePath, encodeSourcePaths, stripPaths } from './source-path.js';
import { richTextFromPlain, RichTextSchema } from './rich-text.js';
import type { MediaRecord } from './media/media.js';

const document = [
    {
        _type: 'block',
        _key: 'b1',
        style: 'h2',
        markDefs: [],
        children: [
            {
                _type: 'span',
                _key: 's1',
                text: 'Plants for a dark office',
                marks: [],
            },
        ],
    },
    {
        _type: 'block',
        _key: 'b2',
        style: 'normal',
        markDefs: [
            {
                _type: 'link',
                _key: 'l1',
                href: 'https://example.com/ferns',
            },
        ],
        children: [
            {
                _type: 'span',
                _key: 's2',
                text: 'Ferns',
                marks: ['strong', 'l1'],
            },
            {
                _type: 'span',
                _key: 's3',
                text: ' cope with little light.',
                marks: [],
            },
        ],
    },
    {
        _type: 'block',
        _key: 'b3',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        markDefs: [],
        children: [
            {
                _type: 'span',
                _key: 's4',
                text: 'Water weekly',
                marks: [],
            },
        ],
    },
    {
        _type: 'image',
        _key: 'i1',
        image: {
            id: 'med_ferns',
            alt: 'Ferns',
        },
    },
];

const ArticlePage = definePage({
    name: 'articlePage',
    fields: [
        {
            name: 'body',
            schema: RichTextSchema,
        },
    ],
});

const media = new Map<string, MediaRecord>([
    [
        'med_ferns',
        {
            id: 'med_ferns',
            key: 'media/ferns.jpg',
            contentType: 'image/jpeg',
            size: 1,
            width: 800,
            height: 600,
            filename: 'ferns.jpg',
            alt: '',
            uploadedAt: '2026-10-03T00:00:00.000Z',
            uploadedBy: 'ada',
        },
    ],
]);

describe('RichTextSchema', () => {
    it('takes headings, marks, links, lists and images as Portable Text', () => {
        expect(RichTextSchema.parse(document)).toEqual(document);
    });

    it('refuses a link to anything but http, https, mailto, tel, a path or an anchor', () => {
        for (const href of ['javascript:alert(1)', 'data:text/html,hi', '//evil.example', 'ftp://example.com']) {
            const linked = structuredClone(document);
            (linked[1] as { markDefs: Array<{ href: string }> }).markDefs[0]!.href = href;
            expect(RichTextSchema.safeParse(linked).success).toBe(false);
        }
        for (const href of ['/blog', '#top', 'mailto:hello@example.com', 'tel:+4712345678', 'http://example.com']) {
            const linked = structuredClone(document);
            (linked[1] as { markDefs: Array<{ href: string }> }).markDefs[0]!.href = href;
            expect(RichTextSchema.safeParse(linked).success).toBe(true);
        }
    });

    it('refuses a mark that is neither a decorator nor a link, and anything that is not a block or an image', () => {
        const marked = structuredClone(document);
        (marked[1] as { children: Array<{ marks: string[] }> }).children[0]!.marks = ['blink'];
        const problem = RichTextSchema.safeParse(marked);
        expect(problem.success).toBe(false);
        expect(problem.error?.issues[0]?.path).toEqual([1, 'children', 0, 'marks', 0]);
        expect(
            RichTextSchema.safeParse([
                {
                    _type: 'html',
                    _key: 'h1',
                    html: '<script></script>',
                },
            ]).success
        ).toBe(false);
    });

    it('flags itself in JSON Schema, so editors and agents know the field is rich text', () => {
        const json = RichTextSchema.toJSONSchema() as Record<string, unknown>;
        expect(json['x-kizuna']).toBe('rich-text');
    });
});

describe('rich text in content', () => {
    it('resolves the images inside it', () => {
        const resolved = resolveContent(
            ArticlePage,
            {
                body: document,
            },
            media,
            (id, query) => `/media/${id}/image${query}`
        );
        const image = (resolved['body'] as Array<{ _type: string; image?: unknown }>).find((block) => block._type === 'image');
        expect(image?.image).toEqual({
            id: 'med_ferns',
            url: '/media/med_ferns/image',
            alt: 'Ferns',
            width: 800,
            height: 600,
        });
        expect(resolvedSchema(RichTextSchema).safeParse(resolved['body']).success).toBe(true);
    });

    it('marks the text of spans in draft mode, and leaves keys, marks and links alone', () => {
        const encoded = encodeSourcePaths(ArticlePage, {
            body: document,
        });
        const paragraph = (encoded['body'] as Array<Record<string, unknown>>)[1] as {
            _key: string;
            markDefs: Array<{ href: string }>;
            children: Array<{ _key: string; text: string; marks: string[] }>;
        };
        const span = paragraph.children[0]!;
        expect(decodePath(span.text)).toBe('body.1.children.0.text');
        expect(stripPaths(span.text)).toBe('Ferns');
        expect(span._key).toBe('s2');
        expect(span.marks).toEqual(['strong', 'l1']);
        expect(paragraph.markDefs[0]!.href).toBe('https://example.com/ferns');
        expect(paragraph._key).toBe('b2');
    });

    it('turns plain text into paragraphs with keys of their own', () => {
        const body = richTextFromPlain('First paragraph.\n\nSecond one,\nstill second.\n\n  ');
        expect(RichTextSchema.parse(body)).toEqual(body);
        expect(body.map((block) => (block._type === 'block' ? block.children[0]!.text : ''))).toEqual([
            'First paragraph.',
            'Second one,\nstill second.',
        ]);
        expect(new Set(body.map((block) => block._key)).size).toBe(2);
    });
});
