import { z } from 'zod';
import { readDef, readMetaBrand, unwrapOptionalWrappers } from 'kizunajs/generator';
import { dataFields, isLayoutItem, objectOf, type Field, type FieldList } from './field.js';
import { isImageSchema } from './image.js';
import type { ContentDefinition } from './definitions.js';

/**
 * Whether a value holds text a translator writes: a string that is no date,
 * address or id, or a list, object or block holding one. An image holds its
 * alt text.
 */
export const holdsText = (schema: z.core.$ZodType, depth = 0): boolean => {
    if (depth > 12) return false;
    const { inner } = unwrapOptionalWrappers(schema);
    if (readMetaBrand(schema) !== undefined || readMetaBrand(inner) !== undefined) return false;
    if (isImageSchema(schema)) return true;
    const def = readDef(inner) as {
        type: string;
        format?: string;
        shape?: Record<string, z.core.$ZodType>;
        element?: z.core.$ZodType;
        options?: readonly z.core.$ZodType[];
    };
    if (def.type === 'string') return def.format === undefined;
    if (def.type === 'object') {
        return Object.entries(def.shape ?? {}).some(([key, value]) => !key.startsWith('_') && holdsText(value, depth + 1));
    }
    if (def.type === 'array') return def.element !== undefined && holdsText(def.element, depth + 1);
    if (def.type === 'union') return (def.options ?? []).some((option) => holdsText(option, depth + 1));
    return false;
};

/**
 * Whether each language holds its own value of a field: its `localized`, or
 * else whether it holds text.
 */
export const isTranslated = (field: Field): boolean => field.localized ?? holdsText(field.schema);

const words = (name: string): string =>
    name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]/g, ' ')
        .toLowerCase()
        .replace(/^./, (first) => first.toUpperCase());

/**
 * The fields a translation holds, in their layout. An image's field holds its
 * alt text, since the image itself is the same in every language.
 */
const translatedFields = (fields: FieldList): FieldList =>
    fields.flatMap((item): FieldList => {
        if (isLayoutItem(item)) {
            const inner = translatedFields(item.fields);
            return inner.length === 0
                ? []
                : [
                      {
                          ...item,
                          fields: inner,
                      },
                  ];
        }
        if (item.sites !== undefined || !isTranslated(item)) return [];
        const { condition: _, perSite: __, ...field } = item;
        if (!isImageSchema(item.schema)) return [field];
        return [
            {
                ...field,
                label: `${item.label ?? words(item.name)} alt text`,
                schema: unwrapOptionalWrappers(item.schema).optional ? z.string().optional() : z.string(),
            },
        ];
    });

const translations = new WeakMap<ContentDefinition, ContentDefinition | null>();

/**
 * What a translation of a document holds: its translated fields, each in
 * its place. `undefined` when no field is translated.
 */
export const translationOf = (definition: ContentDefinition): ContentDefinition | undefined => {
    if (!translations.has(definition)) {
        const fields = translatedFields(definition.fields);
        translations.set(
            definition,
            fields.length === 0
                ? null
                : {
                      name: definition.name,
                      ...(definition.label === undefined
                          ? {}
                          : {
                                label: definition.label,
                            }),
                      ...(definition.group === undefined
                          ? {}
                          : {
                                group: definition.group,
                            }),
                      ...(definition.requireReview === undefined
                          ? {}
                          : {
                                requireReview: definition.requireReview,
                            }),
                      fields,
                      schema: objectOf(fields),
                  }
        );
    }
    return translations.get(definition) ?? undefined;
};

/**
 * A document in one language: the source's content with the translation's
 * fields in place of its own. A field the translation leaves empty stays
 * empty, and an image keeps the source's image with the translation's alt
 * text.
 */
export const withTranslation = (
    definition: ContentDefinition,
    content: Record<string, unknown>,
    translation: Record<string, unknown>
): Record<string, unknown> => {
    const shown: Record<string, unknown> = {
        ...content,
    };
    const declared = dataFields(definition.fields);
    for (const field of dataFields(translationOf(definition)?.fields ?? [])) {
        const value = translation[field.name];
        const source = declared.find((candidate) => candidate.name === field.name);
        if (source !== undefined && isImageSchema(source.schema)) {
            const image = shown[field.name];
            if (typeof image === 'object' && image !== null && typeof value === 'string') {
                shown[field.name] = {
                    ...image,
                    alt: value,
                };
            }
            continue;
        }
        if (value === undefined) delete shown[field.name];
        else shown[field.name] = value;
    }
    return shown;
};

/**
 * The value a translated field starts from in the source: the text itself,
 * or an image's alt text.
 */
export const sourceValueOf = (
    definition: ContentDefinition,
    content: Record<string, unknown> | null | undefined,
    name: string
): unknown => {
    const value = content?.[name];
    const field = dataFields(definition.fields).find((candidate) => candidate.name === name);
    if (field !== undefined && isImageSchema(field.schema)) {
        return typeof value === 'object' && value !== null ? (value as { alt?: unknown }).alt : undefined;
    }
    return value;
};
