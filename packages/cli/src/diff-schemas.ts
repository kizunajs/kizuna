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
    detail?: string;
}

const joinPath = (parent: string, key: string): string => (parent === '' ? key : `${parent}.${key}`);

const fieldsOf = (schema: SchemaNode): Record<string, { optional: boolean; schema: SchemaNode }> | undefined =>
    schema.kind === 'object' ? (schema as Extract<SchemaNode, { kind: 'object' }>).fields : undefined;

const elementOf = (schema: SchemaNode): SchemaNode | undefined =>
    schema.kind === 'array' ? (schema as Extract<SchemaNode, { kind: 'array' }>).element : undefined;

type TaggedUnion = Extract<SchemaNode, { kind: 'union'; discriminator: string }>;

const taggedOf = (schema: SchemaNode): TaggedUnion | undefined =>
    schema.kind === 'union' && 'discriminator' in schema ? (schema as TaggedUnion) : undefined;

const valuesOf = (schema: SchemaNode): string[] | undefined =>
    schema.kind === 'enum' ? (schema as Extract<SchemaNode, { kind: 'enum' }>).values : undefined;

const modelOf = (schema: SchemaNode): string | undefined =>
    schema.kind === 'model' ? (schema as Extract<SchemaNode, { kind: 'model' }>).model : undefined;

const isExtensible = (schema: SchemaNode): boolean => (schema as { extensible?: true }).extensible === true;

const optionsOf = (schema: SchemaNode): SchemaNode[] | undefined => {
    if (schema.kind !== 'union' || taggedOf(schema)) return undefined;
    return (schema as Extract<SchemaNode, { kind: 'union'; options: SchemaNode[] }>).options;
};

/**
 * What a union may hold, tagged or not.
 */
const alternativesOf = (schema: SchemaNode): SchemaNode[] | undefined => {
    const tagged = taggedOf(schema);
    return tagged ? Object.values(tagged.options) : optionsOf(schema);
};

/**
 * Whether every value `narrow` allows is one `wide` allows too. A union holds
 * whatever one of its options holds.
 */
const holds = (wide: SchemaNode, narrow: SchemaNode): boolean => {
    const narrowOptions = alternativesOf(narrow);
    if (narrowOptions) return narrowOptions.every((option) => holds(wide, option));
    const wideOptions = alternativesOf(wide);
    if (wideOptions && wide.kind !== narrow.kind) return wideOptions.some((option) => holds(option, narrow));
    if (wide.kind !== narrow.kind || modelOf(wide) !== modelOf(narrow)) return false;
    if (narrow.nullable === true && wide.nullable !== true) return false;
    return diffSchemas(narrow, wide, 'request').every((change) => !change.breaking);
};

/**
 * What a reader sees when the kinds differ, so `array` reads as `array<string>` and a union as `string | number`.
 */
const describeKind = (schema: SchemaNode): string => {
    const element = elementOf(schema);
    if (element) return `array<${describeKind(element)}>`;
    const options = alternativesOf(schema);
    if (options) return options.map(describeKind).join(' | ');
    return modelOf(schema) ?? schema.kind;
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

    const kindChanged =
        before.kind !== after.kind ||
        modelOf(before) !== modelOf(after) ||
        (taggedOf(before) === undefined) !== (taggedOf(after) === undefined);
    const bothUnions = optionsOf(before) !== undefined && optionsOf(after) !== undefined;
    if (kindChanged || bothUnions) {
        const label = path || 'the body';
        const widened = holds(after, before);
        const narrowed = holds(before, after);
        if (!kindChanged && widened && narrowed) return [];
        // A server that takes more than it did and a client that reads less than it could keep working,
        // and so does a client reading an extensible union, built to take members it doesn't know.
        const extensibleWidening = direction === 'response' && widened && !kindChanged && isExtensible(after);
        if (extensibleWidening || (direction === 'request' ? widened : narrowed)) {
            return [
                {
                    breaking: false,
                    path,
                    summary: `${label} ${direction === 'request' ? 'widens' : 'narrows'} from ${describeKind(before)} to ${describeKind(after)}`,
                    detail: 'the generated client type changes, the HTTP surface does not',
                },
            ];
        }
        return [
            {
                breaking: true,
                path,
                summary: `${label} is ${describeKind(after)} instead of ${describeKind(before)}`,
            },
        ];
    }

    const changes: SchemaChange[] = [];

    // A generated client names a branded value's type after its brand, so the
    // code holding one stops compiling when the brand changes or leaves.
    const wasBrand = (before as { brand?: string }).brand;
    const isBrand = (after as { brand?: string }).brand;
    if (wasBrand !== isBrand) {
        const label = path || 'the body';
        changes.push(
            wasBrand === undefined
                ? {
                      breaking: direction === 'request',
                      path,
                      summary: `${label} is now branded ${isBrand}`,
                  }
                : {
                      breaking: true,
                      path,
                      summary:
                          isBrand === undefined
                              ? `${label} is no longer branded ${wasBrand}`
                              : `${label} is branded ${isBrand} instead of ${wasBrand}`,
                  }
        );
    }

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
                // An extensible union's clients are built to read members they don't know.
                changes.push({
                    breaking: direction === 'response' && !isExtensible(after),
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
            // An extensible enum's clients are built to read values they don't know.
            changes.push({
                breaking: direction === 'response' && !isExtensible(after),
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
