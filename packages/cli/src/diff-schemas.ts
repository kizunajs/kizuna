import type { SchemaNode } from './snapshot.js';

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

const joinPath = (parent: string, key: string): string => (parent === '' ? key : `${parent}.${key}`);

const fieldsOf = (schema: SchemaNode): Record<string, { optional: boolean; schema: SchemaNode }> | undefined =>
    schema.kind === 'object' ? (schema as Extract<SchemaNode, { kind: 'object' }>).fields : undefined;

const elementOf = (schema: SchemaNode): SchemaNode | undefined =>
    schema.kind === 'array' ? (schema as Extract<SchemaNode, { kind: 'array' }>).element : undefined;

const valuesOf = (schema: SchemaNode): string[] | undefined =>
    schema.kind === 'enum' ? (schema as Extract<SchemaNode, { kind: 'enum' }>).values : undefined;

/**
 * What a reader sees when the kinds differ, so `array` reads as `array<string>`.
 */
const describeKind = (schema: SchemaNode): string => {
    const element = elementOf(schema);
    return element ? `array<${describeKind(element)}>` : schema.kind;
};

/**
 * What changed between two versions of one schema, and whether it breaks the
 * people already calling the route.
 */
export const diffSchemas = (
    before: SchemaNode | undefined,
    after: SchemaNode | undefined,
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
        return [{ breaking: direction === 'response', path, summary: `${path || 'the body'} is gone` }];
    }

    const changes: SchemaChange[] = [];

    const beforeElement = elementOf(before);
    const afterElement = elementOf(after);
    if (beforeElement && afterElement) return diffSchemas(beforeElement, afterElement, direction, `${path}[]`);

    const beforeFields = fieldsOf(before);
    const afterFields = fieldsOf(after);

    if (beforeFields && afterFields) {
        for (const [key, field] of Object.entries(afterFields)) {
            const existing = beforeFields[key];
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
                changes.push({ breaking: direction === 'request', path: here, summary: `${here} is no longer optional` });
            }

            if (!existing.optional && field.optional) {
                changes.push({
                    breaking: direction === 'response',
                    path: here,
                    summary: direction === 'response' ? `${here} may now be missing` : `${here} is now optional`,
                });
            }

            changes.push(...diffSchemas(existing.schema, field.schema, direction, here));
        }

        for (const key of Object.keys(beforeFields)) {
            if (afterFields[key]) continue;
            const here = joinPath(path, key);
            changes.push({ breaking: direction === 'response', path: here, summary: `${here} is gone` });
        }

        return changes;
    }

    if (before.kind !== after.kind) {
        return [
            {
                breaking: true,
                path,
                summary: `${path || 'the body'} is ${describeKind(after)} instead of ${describeKind(before)}`,
            },
        ];
    }

    const was = valuesOf(before);
    const now = valuesOf(after);

    if (was && now) {
        const removed = was.filter((value) => !now.includes(value));
        const added = now.filter((value) => !was.includes(value));

        // A caller sending a value it can no longer send, or reading one it was
        // never built to handle, is broken either way round.
        if (removed.length > 0) {
            changes.push({ breaking: true, path, summary: `${path || 'the body'} no longer accepts ${removed.join(', ')}` });
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

    // A predicate cannot be compared across two files, but one arriving or
    // leaving changes what the route accepts.
    const wasRefined = before.refinements ?? 0;
    const isRefined = after.refinements ?? 0;
    if (wasRefined !== isRefined) {
        changes.push({
            breaking: direction === 'request' && isRefined > wasRefined,
            path,
            summary:
                isRefined > wasRefined
                    ? `${path || 'the body'} is validated more tightly`
                    : `${path || 'the body'} is validated less tightly`,
        });
    }

    return changes;
};
