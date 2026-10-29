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

const taggedOf = (schema: SchemaNode): Extract<SchemaNode, { kind: 'union' }> | undefined =>
    schema.kind === 'union' && 'options' in schema ? (schema as Extract<SchemaNode, { kind: 'union' }>) : undefined;

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

    if (before.kind !== after.kind) {
        return [
            {
                breaking: true,
                path,
                summary: `${path || 'the body'} is ${describeKind(after)} instead of ${describeKind(before)}`,
            },
        ];
    }

    const changes: SchemaChange[] = [];

    // A caller decodes a response it never expected to hold `null`, and a
    // server rejects the `null` a caller was allowed to send.
    const wasNullable = before.nullable === true;
    const isNullable = after.nullable === true;
    if (wasNullable !== isNullable) {
        changes.push({
            breaking: direction === (isNullable ? 'response' : 'request'),
            path,
            summary: isNullable ? `${path || 'the body'} can now be null` : `${path || 'the body'} can no longer be null`,
        });
    }

    const beforeElement = elementOf(before);
    const afterElement = elementOf(after);
    if (beforeElement && afterElement) {
        changes.push(...diffSchemas(beforeElement, afterElement, direction, `${path}[]`));
        return changes;
    }

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
                    summary: direction === 'response' ? `${here} may now be left out` : `${here} is now optional`,
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

    const wasTagged = taggedOf(before);
    const nowTagged = taggedOf(after);

    if (wasTagged && nowTagged) {
        const label = path || 'the body';
        if (wasTagged.discriminator !== nowTagged.discriminator) {
            changes.push({
                breaking: true,
                path,
                summary: `${label} is told apart by ${nowTagged.discriminator} instead of ${wasTagged.discriminator}`,
            });
            return changes;
        }
        const { discriminator } = nowTagged;
        for (const [tag, option] of Object.entries(nowTagged.options)) {
            const existing = wasTagged.options[tag];
            if (existing === undefined) {
                changes.push({
                    breaking: direction === 'response',
                    path,
                    summary:
                        direction === 'response'
                            ? `${label} can now be ${discriminator} '${tag}'`
                            : `${label} also accepts ${discriminator} '${tag}'`,
                });
                continue;
            }
            changes.push(...diffSchemas(existing, option, direction, `${path}(${tag})`));
        }
        for (const tag of Object.keys(wasTagged.options)) {
            if (tag in nowTagged.options) continue;
            changes.push({
                breaking: true,
                path,
                summary: `${label} no longer accepts ${discriminator} '${tag}'`,
            });
        }
        return changes;
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
