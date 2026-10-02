import type { z } from 'zod';
import { readMetaBrand, readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { readBlock } from './block.js';
import { fieldDescription, type Field, type FieldAuth, type FieldList } from './field.js';
import type { ContentDefinition } from './definitions.js';
import type { Ref } from './storage/store.js';

/**
 * One field as the CMS describes it to editors and tools: its dotted path,
 * who may write it, and whether anything may.
 */
export interface DescribedField {
    path: string;
    name: string;
    label: string | undefined;
    /**
     * For an enum, the label of each value.
     */
    options: Readonly<Record<string, string>> | undefined;
    description: string | undefined;
    auth: FieldAuth | undefined;
    readOnly: boolean;
    schema: z.ZodType;
    /**
     * The block this field is, when its schema is one.
     */
    block: string | undefined;
    fields: DescribedField[] | undefined;
}

const describe = (field: Field, parentPath: string): DescribedField => {
    const path = parentPath === '' ? field.name : `${parentPath}.${field.name}`;
    const block = readBlock(field.schema);
    return {
        path,
        name: field.name,
        label: field.label,
        options: field.options,
        description: fieldDescription(field),
        auth: field.auth,
        readOnly: field.readOnly === true,
        schema: field.schema,
        block: block?.name,
        fields: block === undefined ? undefined : block.fields.map((inner) => describe(inner, path)),
    };
};

/**
 * Every field of a page, with the fields of each block inside it.
 */
export const describeFields = (page: ContentDefinition): DescribedField[] => page.fields.map((field) => describe(field, ''));

/**
 * The chain of fields a dotted path crosses, from the page's own field down
 * through the blocks, or `undefined` when the path names no field. Segments
 * inside an array or a plain object are values, so the chain stops at the last
 * field that owns them.
 */
export const fieldChain = (fields: FieldList, path: string): Field[] | undefined => {
    const segments = path.split('.');
    const chain: Field[] = [];
    let current: FieldList | undefined = fields;
    for (const segment of segments) {
        if (current === undefined) return chain.length === 0 ? undefined : chain;
        const field: Field | undefined = current.find((candidate) => candidate.name === segment);
        if (field === undefined) return chain.length === 0 ? undefined : chain;
        chain.push(field);
        current = readBlock(field.schema)?.fields;
    }
    return chain;
};

/**
 * Sets a value at a dotted path on a copy of the content, creating objects on
 * the way. A numeric segment under an array indexes into it.
 */
export const setAtPath = (content: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> => {
    const segments = path.split('.');
    const copy: Record<string, unknown> = {
        ...content,
    };
    let cursor: Record<string, unknown> | unknown[] = copy;
    segments.forEach((segment, index) => {
        const last = index === segments.length - 1;
        const key: string | number = Array.isArray(cursor) ? Number(segment) : segment;
        if (last) {
            (cursor as Record<string | number, unknown>)[key] = value;
            return;
        }
        const existing = (cursor as Record<string | number, unknown>)[key];
        const next = Array.isArray(existing)
            ? [...existing]
            : existing !== null && typeof existing === 'object'
              ? {
                    ...(existing as Record<string, unknown>),
                }
              : /^\d+$/.test(segments[index + 1]!)
                ? []
                : {};
        (cursor as Record<string | number, unknown>)[key] = next;
        cursor = next;
    });
    return copy;
};

/**
 * Reads the value at a dotted path, or `undefined`.
 */
export const getAtPath = (content: unknown, path: string): unknown => {
    let cursor: unknown = content;
    for (const segment of path.split('.')) {
        if (cursor === null || typeof cursor !== 'object') return undefined;
        cursor = (cursor as Record<string, unknown>)[segment];
    }
    return cursor;
};

const collectRefs = (schema: z.core.$ZodType, value: unknown, path: string, into: Ref[]): void => {
    if (value === undefined || value === null) return;
    const brand = readMetaBrand(schema) ?? readMetaBrand(unwrapOptionalWrappers(schema).inner);
    if (brand !== undefined) {
        into.push({
            brand,
            refId: String(value),
            fieldPath: path,
        });
        return;
    }
    const inner = unwrapOptionalWrappers(schema).inner;
    const def = readDef(inner);
    if (def.type === 'array' && def.element !== undefined && Array.isArray(value)) {
        value.forEach((item, index) => collectRefs(def.element!, item, `${path}.${index}`, into));
        return;
    }
    if (def.type === 'object' && def.shape !== undefined && typeof value === 'object') {
        for (const [key, child] of Object.entries(def.shape)) {
            collectRefs(child, (value as Record<string, unknown>)[key], path === '' ? key : `${path}.${key}`, into);
        }
        return;
    }
    if ((def.type === 'union' || def.type === 'pipe') && def.options !== undefined) {
        for (const option of def.options) collectRefs(option, value, path, into);
    }
};

/**
 * Every branded id a document holds, with the field path it sits at. Rebuilt
 * on every save, so `cms_refs` always mirrors the content.
 */
export const refsOf = (page: ContentDefinition, content: Record<string, unknown>): Ref[] => {
    const refs: Ref[] = [];
    for (const field of page.fields) collectRefs(field.schema, content[field.name], field.name, refs);
    return refs;
};

/**
 * The migration steps a stored document still has to run, in order.
 */
export const pendingMigrations = (
    page: ContentDefinition,
    migrationVersion: number
): Array<[number, NonNullable<ContentDefinition['migrate']>[number]]> =>
    Object.entries(page.migrate ?? {})
        .map(([version, step]) => [Number(version), step] as [number, NonNullable<ContentDefinition['migrate']>[number]])
        .filter(([version]) => version > migrationVersion)
        .sort(([left], [right]) => left - right);

/**
 * The highest migration step a page declares, or 0.
 */
export const latestMigration = (page: ContentDefinition): number => Math.max(0, ...Object.keys(page.migrate ?? {}).map(Number));

/**
 * Runs every pending step over a copy of the content.
 */
export const migrateContent = (
    page: ContentDefinition,
    content: Record<string, unknown>,
    migrationVersion: number
): Record<string, unknown> => {
    let current = content;
    for (const [, step] of pendingMigrations(page, migrationVersion)) current = step(current);
    return current;
};

/**
 * The top-level fields a draft is missing or fails, as the setup screen lists
 * them.
 */
export const missingFields = (page: ContentDefinition, draft: Record<string, unknown> | null): string[] => {
    const result = page.schema.safeParse(draft ?? {});
    if (result.success) return [];
    const missing = new Set<string>();
    for (const issue of result.error.issues) {
        const [first] = issue.path;
        if (typeof first === 'string') missing.add(first);
    }
    return page.fields.map((field) => field.name).filter((name) => missing.has(name));
};
