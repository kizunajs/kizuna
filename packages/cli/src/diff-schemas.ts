import type { z } from 'zod';
import { readDef, readObjectShape, unwrapOptionalWrappers } from 'kizunajs/generator';

/**
 * Which way a schema travels, which decides what a change costs.
 *
 * A caller sends requests and reads responses, so tightening an input and
 * dropping an output are the two that break them.
 */
export type Direction = 'request' | 'response';

export interface SchemaChange {
    breaking: boolean;
    /**
     * `body.organisationId`, relative to the schema being compared.
     */
    path: string;
    summary: string;
}

interface Shape {
    fields: Map<string, { schema: z.core.$ZodType; optional: boolean }>;
}

const shapeOf = (schema: z.core.$ZodType): Shape | undefined => {
    const { inner } = unwrapOptionalWrappers(schema);
    const raw = readObjectShape(inner);
    if (!raw) return undefined;

    const fields = new Map<string, { schema: z.core.$ZodType; optional: boolean }>();
    for (const [key, field] of Object.entries(raw)) {
        fields.set(key, { schema: field, optional: unwrapOptionalWrappers(field).optional });
    }
    return { fields };
};

/**
 * What a schema accepts, flattened enough to compare: its kind, and its values
 * when it is closed.
 */
const describe = (schema: z.core.$ZodType): { kind: string; values?: string[] } => {
    const { inner } = unwrapOptionalWrappers(schema);
    const def = readDef(inner);

    if (def.type === 'enum') {
        return {
            kind: 'enum',
            values: Object.values(def.entries ?? {})
                .map(String)
                .sort(),
        };
    }
    if (def.type === 'literal') {
        return { kind: 'enum', values: (def.values ?? []).map(String).sort() };
    }
    if (def.type === 'array' && def.element) {
        return { kind: `array<${describe(def.element).kind}>` };
    }
    return { kind: def.type ?? 'unknown' };
};

const joinPath = (parent: string, key: string): string => (parent === '' ? key : `${parent}.${key}`);

/**
 * The element of an array, so a change inside one is reported at its own path
 * rather than as the whole array changing shape.
 */
const elementOf = (schema: z.core.$ZodType): z.core.$ZodType | undefined => {
    const { inner } = unwrapOptionalWrappers(schema);
    const def = readDef(inner);
    return def.type === 'array' ? def.element : undefined;
};

/**
 * What changed between two versions of one schema, and whether it breaks the
 * people already calling the route.
 */
export const diffSchemas = (
    before: z.core.$ZodType | undefined,
    after: z.core.$ZodType | undefined,
    direction: Direction,
    path = ''
): SchemaChange[] => {
    if (before === undefined && after === undefined) return [];

    if (before === undefined) {
        return after === undefined
            ? []
            : [
                  {
                      breaking: direction === 'request',
                      path,
                      summary: direction === 'request' ? `${path || 'a body'} is now required` : `${path || 'a body'} is now sent`,
                  },
              ];
    }

    if (after === undefined) {
        return [
            {
                breaking: direction === 'response',
                path,
                summary: `${path || 'the body'} is gone`,
            },
        ];
    }

    const changes: SchemaChange[] = [];

    const beforeElement = elementOf(before);
    const afterElement = elementOf(after);
    if (beforeElement && afterElement) return diffSchemas(beforeElement, afterElement, direction, `${path}[]`);

    const beforeShape = shapeOf(before);
    const afterShape = shapeOf(after);

    if (beforeShape && afterShape) {
        for (const [key, field] of afterShape.fields) {
            const existing = beforeShape.fields.get(key);
            const here = joinPath(path, key);

            if (!existing) {
                if (!field.optional) {
                    changes.push({
                        breaking: direction === 'request',
                        path: here,
                        summary: direction === 'request' ? `${here} is now required` : `${here} is now part of the response`,
                    });
                }
                continue;
            }

            if (existing.optional && !field.optional) {
                changes.push({
                    breaking: direction === 'request',
                    path: here,
                    summary: `${here} is no longer optional`,
                });
            }

            changes.push(...diffSchemas(existing.schema, field.schema, direction, here));
        }

        for (const [key] of beforeShape.fields) {
            if (afterShape.fields.has(key)) continue;
            const here = joinPath(path, key);
            changes.push({
                breaking: direction === 'response',
                path: here,
                summary: `${here} is gone`,
            });
        }

        return changes;
    }

    const was = describe(before);
    const now = describe(after);

    if (was.kind !== now.kind) {
        changes.push({
            breaking: true,
            path,
            summary: `${path || 'the body'} is ${now.kind} instead of ${was.kind}`,
        });
        return changes;
    }

    if (was.values && now.values) {
        const removed = was.values.filter((value) => !now.values?.includes(value));
        const added = now.values.filter((value) => !was.values?.includes(value));

        // A caller sending a value it can no longer send, or reading one it was
        // never built to handle, is broken either way round.
        if (removed.length > 0) {
            changes.push({
                breaking: true,
                path,
                summary: `${path || 'the body'} no longer accepts ${removed.join(', ')}`,
            });
        }
        if (added.length > 0) {
            changes.push({
                breaking: direction === 'response',
                path,
                summary:
                    direction === 'response'
                        ? `${path || 'the body'} can now be ${added.join(', ')}`
                        : `${path || 'the body'} also accepts ${added.join(', ')}`,
            });
        }
    }

    return changes;
};
