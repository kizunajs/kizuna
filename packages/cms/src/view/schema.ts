import type { WireCondition } from '../condition.js';

/**
 * The JSON Schema `describe` hands out for each field, as much of it as the
 * editor reads.
 */
export type JsonSchema = Record<string, unknown> & {
    type?: string | string[];
    format?: string;
    enum?: unknown[];
    maxLength?: number;
    minLength?: number;
    minimum?: number;
    maximum?: number;
    minItems?: number;
    maxItems?: number;
    items?: JsonSchema;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    description?: string;
    brand?: string;
    pattern?: string;
    $ref?: string;
    $defs?: Record<string, JsonSchema>;
    anyOf?: JsonSchema[];
    oneOf?: JsonSchema[];
    const?: unknown;
};

/**
 * One block a list of blocks may hold, as `describe` answers it.
 */
export interface DescribedBlock {
    name: string;
    label?: string;
    description?: string;
    fields: Array<{
        name: string;
        label?: string;
        options?: Record<string, string>;
        description?: string;
        required: boolean;
        condition?: WireCondition;
    }>;
}

/**
 * The key an item of a list of blocks names its block under.
 */
export const BLOCK_KEY = 'block';

/**
 * One field as `describe` answers it.
 */
export interface DescribedField {
    path: string;
    name: string;
    label?: string;
    options?: Record<string, string>;
    description?: string;
    help?: string;
    block?: string;
    /**
     * For a list of blocks, the blocks an item may be.
     */
    blocks?: DescribedBlock[];
    parent?: string;
    position?: 'sidebar';
    width?: string;
    /**
     * The ids of the tabs, rows and collapsibles it sits in, outermost first.
     */
    layout?: string[];
    readOnly: boolean;
    /**
     * Whether the document needs a value here before it can publish, while
     * the field shows.
     */
    required: boolean;
    /**
     * When the field shows, from a field beside it.
     */
    condition?: WireCondition;
    writable: boolean;
    roles?: string[];
    brand?: string;
    searchTool?: string;
    schema: JsonSchema;
    value?: unknown;
    /**
     * Whose value this is: `Shared`, or the label of the site that sets it.
     */
    belongsTo?: string;
    /**
     * The shared value, which the site shows while it sets none of its own.
     */
    sharedValue?: unknown;
}

/**
 * One tab, row or collapsible as `describe` answers it.
 */
export interface DescribedLayout {
    id: string;
    type: 'tab' | 'row' | 'collapsible';
    label?: string;
    position?: 'sidebar';
}

export type DocumentStatus = 'empty' | 'draft' | 'published' | 'changed';

/**
 * A document as `describe` answers it.
 */
export interface Description {
    ref: string;
    kind: 'page' | 'global' | 'item';
    name: string;
    label?: string;
    path: string | null;
    /**
     * The page Live Preview opens on, or `null` when no page shows it.
     */
    previewPath: string | null;
    usedOn: {
        everywhere: boolean;
        pages: Array<{
            name: string;
            path: string;
        }>;
    };
    status: DocumentStatus;
    version: number;
    complete: boolean;
    missing: string[];
    fields: DescribedField[];
    layout: DescribedLayout[];
    draft: Record<string, unknown> | null;
    owner: PersonView | null;
    review: ReviewState | null;
    requireReview: boolean;
    /**
     * For an item, the buttons its collection's actions show the editor.
     */
    actions?: Array<{
        name: string;
        label: string;
        confirm?: string;
        available: boolean;
    }>;
}

/**
 * Someone as the editor shows them.
 */
export interface PersonView {
    id: string;
    name: string;
    image?: string;
}

/**
 * A comment on one field of a review's draft.
 */
export interface ReviewComment {
    id: string;
    /**
     * The field, as a change to it is keyed.
     */
    path: string;
    text: string;
    by: PersonView;
    createdAt: string;
    resolvedBy: PersonView | null;
    resolvedAt: string | null;
}

/**
 * Where a document's latest review stands.
 */
export interface ReviewState {
    id: string;
    status: 'open' | 'approved' | 'changes' | 'outdated' | 'withdrawn' | 'published-past-review';
    version: number;
    reviewers: PersonView[];
    requestedBy: PersonView;
    note: string | null;
    createdAt: string;
    decidedBy: PersonView | null;
    decisionNote: string | null;
    decidedAt: string | null;
    /**
     * Comments on single fields, since the document was last published.
     */
    comments: ReviewComment[];
}

/**
 * A draft as the draft routes answer it.
 */
export interface Draft {
    ref: string;
    name: string;
    path: string | null;
    status: DocumentStatus;
    version: number;
    content: Record<string, unknown> | null;
    complete: boolean;
    missing: string[];
    updatedAt: string | null;
    /**
     * Who saved it last, by id.
     */
    updatedBy: string | null;
}

/**
 * Same rule as the CMS's rich-text links: a web or mail link, a phone number,
 * a path on the site or an anchor.
 */
export const SAFE_HREF = /^(?:https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

export const isRichText = (schema: JsonSchema): boolean => schema['x-kizuna'] === 'rich-text';

export const resolveRef = (schema: JsonSchema, root: JsonSchema): JsonSchema => {
    if (schema.$ref === undefined) return schema;
    return root.$defs?.[schema.$ref.replace('#/$defs/', '')] ?? schema;
};

export const isImage = (schema: JsonSchema, root: JsonSchema): boolean => {
    const resolved = resolveRef(schema, root);
    if (schema.$ref === '#/$defs/CMS.Image' || resolved['id'] === 'CMS.Image') return true;
    const keys = Object.keys(resolved.properties ?? {});
    return keys.includes('id') && keys.includes('alt') && keys.every((key) => ['id', 'alt', 'crop', 'focalPoint'].includes(key));
};

export const typeOf = (schema: JsonSchema): string | undefined => {
    if (Array.isArray(schema.type)) return schema.type.find((candidate) => candidate !== 'null');
    if (schema.type !== undefined) return schema.type;
    if (schema.anyOf !== undefined) return typeOf(schema.anyOf.find((option) => option.type !== 'null') ?? {});
    if (schema.oneOf !== undefined) return typeOf(schema.oneOf[0] ?? {});
    return undefined;
};

/**
 * The block an option of a list's items names under `block`, or `undefined`
 * for an option that names none.
 */
const blockNameOf = (option: JsonSchema, root: JsonSchema): string | undefined => {
    const tag = resolveRef(option, root).properties?.[BLOCK_KEY]?.const;
    return typeof tag === 'string' ? tag : undefined;
};

/**
 * The options of a list of blocks' items, each with the name it carries, or
 * `undefined` when the items are no blocks.
 */
export const blockOptionsOf = (itemSchema: JsonSchema, root: JsonSchema): Array<{ name: string; schema: JsonSchema }> | undefined => {
    const options = resolveRef(itemSchema, root).oneOf;
    if (options === undefined || options.length === 0) return undefined;
    const named = options.flatMap((option) => {
        const name = blockNameOf(option, root);
        return name === undefined
            ? []
            : [
                  {
                      name,
                      schema: resolveRef(option, root),
                  },
              ];
    });
    return named.length === options.length ? named : undefined;
};

/**
 * The block an item names, or `undefined`.
 */
export const itemBlockName = (value: unknown): string | undefined => {
    const name = typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[BLOCK_KEY] : undefined;
    return typeof name === 'string' ? name : undefined;
};

/**
 * A new value for a schema: what an added list item starts as.
 */
export const emptyFor = (schema: JsonSchema, root: JsonSchema): unknown => {
    const resolved = resolveRef(schema, root);
    switch (typeOf(resolved)) {
        case 'string':
            return '';
        case 'number':
        case 'integer':
            return resolved.minimum ?? 0;
        case 'boolean':
            return false;
        case 'array':
            return [];
        case 'object': {
            const value: Record<string, unknown> = {};
            for (const key of resolved.required ?? []) value[key] = emptyFor(resolved.properties?.[key] ?? {}, root);
            return value;
        }
        default:
            return undefined;
    }
};

export const humanize = (name: string): string =>
    name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());

export const valueAt = (draft: unknown, path: string): unknown => {
    let cursor: unknown = draft;
    for (const segment of path.split('.')) {
        if (cursor === null || typeof cursor !== 'object') return undefined;
        cursor = (cursor as Record<string, unknown>)[segment];
    }
    return cursor;
};

/**
 * The described field that holds a path: the field itself, or the nearest one
 * above it.
 */
export const fieldHolding = (fields: readonly DescribedField[], path: string): DescribedField | undefined => {
    const exact = fields.find((field) => field.path === path);
    if (exact !== undefined) return exact;
    return fields.filter((field) => path.startsWith(`${field.path}.`)).sort((left, right) => right.path.length - left.path.length)[0];
};

export const labelOf = (field: DescribedField): string => field.label ?? humanize(field.name);

/**
 * What the editor's header calls a document.
 */
export const documentTitle = (document: Description): string => {
    if (document.kind !== 'item' && document.label !== undefined) return document.label;
    if (document.kind === 'global') return humanize(document.name);
    if (document.kind === 'item') {
        const text = document.fields.map((field) => field.value).find((value) => typeof value === 'string' && value !== '');
        return typeof text === 'string' ? text : 'Untitled';
    }
    return humanize(document.name);
};
