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
};

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
    parent?: string;
    readOnly: boolean;
    writable: boolean;
    roles?: string[];
    brand?: string;
    searchTool?: string;
    schema: JsonSchema;
    value?: unknown;
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
    draft: Record<string, unknown> | null;
    owner: PersonView | null;
    review: ReviewState | null;
    requireReview: boolean;
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
 * Where a document's latest review stands.
 */
export interface ReviewState {
    id: string;
    status: 'open' | 'approved' | 'changes' | 'outdated';
    version: number;
    reviewers: PersonView[];
    requestedBy: PersonView;
    note: string | null;
    createdAt: string;
    decidedBy: PersonView | null;
    decisionNote: string | null;
    decidedAt: string | null;
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
    if (schema.$ref === '#/$defs/CmsImage' || resolved['id'] === 'CmsImage') return true;
    const keys = Object.keys(resolved.properties ?? {});
    return keys.includes('id') && keys.includes('alt') && keys.every((key) => ['id', 'alt', 'crop', 'focalPoint'].includes(key));
};

export const typeOf = (schema: JsonSchema): string | undefined => {
    if (Array.isArray(schema.type)) return schema.type.find((candidate) => candidate !== 'null');
    if (schema.type !== undefined) return schema.type;
    if (schema.anyOf !== undefined) return typeOf(schema.anyOf.find((option) => option.type !== 'null') ?? {});
    return undefined;
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
