import type { z } from 'zod';
import { readDef, readMetaBrand, unwrapOptionalWrappers } from 'kizunajs/generator';
import { brandOf } from '../cms.js';
import type { Collection } from '../definitions.js';
import { dataFields } from '../field.js';
import type { ListFilter, ListOptions } from './config.js';

/**
 * An enum's values, read through `.optional()` and a list.
 */
const enumValuesOf = (schema: z.core.$ZodType): string[] | undefined => {
    const def = readDef(unwrapOptionalWrappers(schema).inner);
    if (def.type === 'enum' && def.entries !== undefined) return Object.values(def.entries).map(String);
    return def.type === 'array' && def.element !== undefined ? enumValuesOf(def.element) : undefined;
};

/**
 * How each collection lists in the admin: the field its `tree` names, and the
 * fields of its `indexes` an editor can pick a value of. An index holding
 * text or a number sorts the list, and the search box finds its text.
 */
export const listOptionsOf = (collections: readonly Collection[]): Record<string, ListOptions> => {
    const trees = new Set(
        collections.filter((definition) => definition.tree !== undefined).map((definition) => readMetaBrand(definition.id))
    );
    return Object.fromEntries(
        collections.map((definition) => {
            const fields = dataFields(definition.fields);
            const filters = (definition.indexes ?? []).flatMap((name): ListFilter[] => {
                const field = fields.find((candidate) => candidate.name === name);
                if (field === undefined) return [];
                const label = field.label ?? null;
                const values = enumValuesOf(field.schema);
                if (values !== undefined) {
                    return [
                        {
                            field: name,
                            label,
                            choices: values.map((value) => ({
                                value,
                                label: field.options?.[value] ?? value,
                            })),
                        },
                    ];
                }
                const brand = brandOf(field.schema);
                if (brand === undefined) return [];
                return [
                    {
                        field: name,
                        label,
                        brand,
                        nested: trees.has(brand),
                    },
                ];
            });
            return [
                definition.name,
                {
                    ...(definition.tree === undefined
                        ? {}
                        : {
                              tree: definition.tree,
                          }),
                    filters,
                },
            ];
        })
    );
};
