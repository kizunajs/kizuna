import { z } from 'zod';
import { readDef, readMeta, unwrapOptionalWrappers } from 'kizunajs/generator';
import { dataFields, describedForAgents } from './field.js';
import { optionOf } from './union.js';
import type { ContentDefinition } from './definitions.js';

/**
 * What a URL link may point at: an http or https URL, `mailto:`, `tel:`, a
 * path on this site, or an anchor. Never `javascript:` or `data:`.
 */
export const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

/**
 * What a content link holds: a page or an item by its ref, like
 * `page:uk:plantCarePage` or `item:offices:k3j9x2`, never in a language.
 */
export const LINK_REF = /^(?:page:(?:[a-z][a-z0-9-]*:)?[A-Za-z_][A-Za-z0-9_]*|item:(?:[a-z][a-z0-9-]*:)?[A-Za-z_][A-Za-z0-9_]*:[^:@\s]+)$/;

/**
 * The brand `cms_refs` records a content link's target under.
 */
export const LINK_BRAND = 'CMS.Link';

const LINK_KIND = 'link';
const RICH_TEXT_LINK_KIND = 'rich-text-link';

/**
 * The ref a content link stores, described for an agent writing one.
 */
export const linkRefSchema = () =>
    z
        .string()
        .regex(LINK_REF)
        .describe(
            'A page or an item to link to, by its ref: page:<name>, page:<site>:<name>, item:<collection>:<id> or item:<site>:<collection>:<id>. The reader turns it into the address for the site and language being read. Set ref or href, not both.'
        );

/**
 * The URL a URL link stores, described for an agent writing one.
 */
export const linkHrefSchema = () =>
    z
        .string()
        .max(2048)
        .regex(SAFE_HREF)
        .describe('A URL typed by hand: https://, http://, mailto:, tel:, a path like /blog, or an #anchor. Set ref or href, not both.');

/**
 * Whether a link holds exactly one of `ref` and `href`.
 */
export const holdsOneTarget = (value: { ref?: unknown; href?: unknown }): boolean =>
    (value.ref === undefined) !== (value.href === undefined);

const ONE_TARGET = {
    error: 'A link holds a ref to a page or an item, or an href, and not both.',
};

/**
 * A link as a field stores it: a page or an item by `ref`, or a URL under
 * `href`, and the words it shows.
 */
export type LinkRef = {
    ref?: string;
    href?: string;
    label?: string;
} & z.core.$brand<'CMS.Link'>;

/**
 * A link as a component receives it: its address for the site and language
 * being read, or `null` when its page or item is unpublished or deleted, so
 * the label shows as plain text.
 */
export interface ResolvedLink {
    href: string | null;
    label?: string;
}

/**
 * A link field, for a button or a menu: a page or an item picked in the CMS,
 * on any site, or a URL typed by hand, with the words it shows. A content
 * link holds the target's id, so it follows the page when its address
 * changes, and the reader hands the component the address for the site and
 * language being read.
 *
 * @example
 * {
 *     name: 'menu',
 *     schema: z.array(link()),
 * },
 */
export const link = (): z.ZodType<LinkRef, { ref?: string; href?: string; label?: string }> =>
    describedForAgents(
        z
            .object({
                ref: linkRefSchema().optional(),
                href: linkHrefSchema().optional(),
                label: z.string().max(200).optional().describe('The words the link shows.'),
            })
            .refine(holdsOneTarget, ONE_TARGET)
            .meta({
                'x-kizuna': LINK_KIND,
                description: 'A link to a page or an item by ref, or to a URL under href, with the words it shows.',
            })
            .brand<'CMS.Link'>()
    ) as unknown as z.ZodType<LinkRef, { ref?: string; href?: string; label?: string }>;

/**
 * The mark rich text stores for a link: a page or an item by `ref`, or a URL
 * under `href`.
 */
export const richTextLinkSchema = <Key extends z.ZodString>(key: Key) =>
    z
        .object({
            _type: z.literal('link'),
            _key: key,
            ref: linkRefSchema().optional(),
            href: linkHrefSchema().optional(),
        })
        .refine(holdsOneTarget, ONE_TARGET)
        .meta({
            'x-kizuna': RICH_TEXT_LINK_KIND,
        });

/**
 * Which kind of link a schema stores, read through `.optional()` and
 * `.default()`: a link field, a rich text link mark, or neither.
 */
export const linkKindOf = (schema: z.core.$ZodType): 'field' | 'rich-text' | undefined => {
    const kind = readMeta(schema)?.['x-kizuna'] ?? readMeta(unwrapOptionalWrappers(schema).inner)?.['x-kizuna'];
    if (kind === LINK_KIND) return 'field';
    if (kind === RICH_TEXT_LINK_KIND) return 'rich-text';
    return undefined;
};

/**
 * A link as stored, wherever it sits.
 */
interface StoredLink {
    ref?: unknown;
    href?: unknown;
    label?: unknown;
    _type?: unknown;
    _key?: unknown;
}

const DROP: unique symbol = Symbol('drop');

const DECORATORS = new Set(['strong', 'em', 'code', 'underline']);

/**
 * A value with each link its schema places replaced by what `visit` answers.
 * A rich text mark `visit` drops leaves its block, and the spans it marked
 * keep their text.
 */
const mapLinks = (
    schema: z.core.$ZodType,
    value: unknown,
    path: string,
    visit: (link: StoredLink, kind: 'field' | 'rich-text', path: string) => unknown
): unknown => {
    if (value === undefined || value === null) return value;
    const kind = linkKindOf(schema);
    if (kind !== undefined) return typeof value === 'object' ? visit(value as StoredLink, kind, path) : value;
    const def = readDef(unwrapOptionalWrappers(schema).inner);
    if (def.type === 'array' && def.element !== undefined && Array.isArray(value)) {
        return value.map((item, index) => mapLinks(def.element!, item, `${path}.${index}`, visit)).filter((item) => item !== DROP);
    }
    if (def.options !== undefined) {
        const option = optionOf(def, value);
        return option === undefined ? value : mapLinks(option, value, path, visit);
    }
    if (def.type === 'object' && def.shape !== undefined && typeof value === 'object') {
        const mapped: Record<string, unknown> = {
            ...(value as Record<string, unknown>),
        };
        for (const [key, child] of Object.entries(def.shape)) {
            if (key in mapped) mapped[key] = mapLinks(child, mapped[key], path === '' ? key : `${path}.${key}`, visit);
        }
        return withoutDroppedMarks(value as Record<string, unknown>, mapped);
    }
    return value;
};

/**
 * A rich text block with the marks of links it no longer holds taken off its
 * spans.
 */
const withoutDroppedMarks = (before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> => {
    if (before['_type'] !== 'block' || !Array.isArray(before['markDefs']) || !Array.isArray(after['markDefs'])) return after;
    const kept = new Set((after['markDefs'] as StoredLink[]).map((mark) => mark._key));
    const known = (mark: unknown): boolean => typeof mark === 'string' && (DECORATORS.has(mark) || kept.has(mark));
    if (!Array.isArray(after['children'])) return after;
    return {
        ...after,
        children: (after['children'] as Array<Record<string, unknown>>).map((span) =>
            Array.isArray(span['marks'])
                ? {
                      ...span,
                      marks: (span['marks'] as unknown[]).filter(known),
                  }
                : span
        ),
    };
};

/**
 * One content link a document holds: where it sits and the ref it points at.
 */
export interface ContentLink {
    path: string;
    ref: string;
}

/**
 * Every content link a document holds, in rich text and link fields alike,
 * with the field path it sits at.
 */
export const contentLinksOf = (definition: ContentDefinition, content: Record<string, unknown>): ContentLink[] => {
    const found: ContentLink[] = [];
    for (const field of dataFields(definition.fields)) {
        mapLinks(field.schema, content[field.name], field.name, (stored, _, path) => {
            if (typeof stored.ref === 'string') {
                found.push({
                    path,
                    ref: stored.ref,
                });
            }
            return stored;
        });
    }
    return found;
};

/**
 * A document with every link as a component reads it: a content link's ref
 * turned into the address `hrefOf` answers, and a URL link as typed. A rich
 * text link whose target `hrefOf` cannot address is taken out, so its words
 * read as plain text, and a link field's `href` is `null`.
 */
export const withResolvedLinks = (
    definition: ContentDefinition,
    content: Record<string, unknown>,
    hrefOf: (ref: string) => string | undefined
): Record<string, unknown> => {
    const resolved: Record<string, unknown> = {
        ...content,
    };
    for (const field of dataFields(definition.fields)) {
        if (!(field.name in content)) continue;
        resolved[field.name] = mapLinks(field.schema, content[field.name], field.name, (stored, kind) => {
            const href = typeof stored.ref === 'string' ? hrefOf(stored.ref) : typeof stored.href === 'string' ? stored.href : undefined;
            if (kind === 'rich-text') {
                return href === undefined
                    ? DROP
                    : {
                          _type: 'link',
                          _key: stored._key,
                          href,
                      };
            }
            return {
                href: href ?? null,
                ...(typeof stored.label === 'string'
                    ? {
                          label: stored.label,
                      }
                    : {}),
            };
        });
    }
    return resolved;
};

/**
 * A link as the reader's output schema describes it, for the generated
 * clients: the rich text mark with its `href`, or a link field's `href` and
 * label.
 */
export const resolvedLinkSchema = (kind: 'field' | 'rich-text'): z.ZodType =>
    kind === 'rich-text'
        ? z.object({
              _type: z.literal('link'),
              _key: z.string(),
              href: z.string().describe("The link's address for the site and language being read."),
          })
        : z.object({
              href: z
                  .string()
                  .nullable()
                  .describe("The link's address for the site and language being read, or null when its page or item is not published."),
              label: z.string().optional(),
          });
