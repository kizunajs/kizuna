import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { readDef, readMetaBrand, unwrapOptionalWrappers } from 'kizunajs/generator';
import { BLOCK_KEY, readBlock, readBlocks } from './block.js';
import { dataFields, type FieldList } from './field.js';
import { isImageSchema } from './image.js';

/**
 * The model the CMS drafts translations with.
 */
export interface TranslateOptions {
    /**
     * An AI SDK language model, made with the provider of your choice.
     *
     * @example
     * model: anthropic('claude-sonnet-5-5'),
     */
    model: LanguageModel;
}

/**
 * The model answered with something the fields cannot hold.
 */
export class TranslationError extends Error {
    override name = 'TranslationError';
}

/**
 * What {@link translateFields} takes.
 */
export interface TranslateInput {
    model: LanguageModel;
    fields: FieldList;
    values: Readonly<Record<string, unknown>>;
    from: string;
    to: string;
}

type Path = ReadonlyArray<string | number>;

interface Text {
    path: Path;
    text: string;
    schema: z.core.$ZodType;
}

type Values = Record<string | number, unknown>;

const isObject = (value: unknown): value is Values => typeof value === 'object' && value !== null;

/**
 * A string a person reads. A string with a format or a pattern, like a URL,
 * a slug or a key, and an id carrying a brand, stay as they are.
 */
const isText = (schema: z.core.$ZodType): boolean => {
    const def = readDef(schema);
    if (def.type !== 'string' || def.format !== undefined || readMetaBrand(schema) !== undefined) return false;
    return !(schema as z.core.$ZodString)._zod.def.checks?.some((check) => 'format' in check._zod.def);
};

const collectFields = (fields: FieldList, value: unknown, path: Path, found: Text[]): void => {
    if (!isObject(value)) return;
    for (const field of dataFields(fields)) {
        if (field.localized === false) continue;
        collect(field.schema, value[field.name], [...path, field.name], found);
    }
};

const collect = (schema: z.core.$ZodType, value: unknown, path: Path, found: Text[]): void => {
    if (value === undefined || value === null) return;
    const listed = readBlocks(schema);
    if (listed !== undefined) {
        if (!Array.isArray(value)) return;
        value.forEach((item: unknown, index) => {
            const block = isObject(item) ? listed.find((candidate) => candidate.name === item[BLOCK_KEY]) : undefined;
            if (block !== undefined) collectFields(block.fields, item, [...path, index], found);
        });
        return;
    }
    const block = readBlock(schema);
    if (block !== undefined) {
        collectFields(block.fields, value, path, found);
        return;
    }
    const inner = unwrapOptionalWrappers(schema).inner;
    const def = readDef(inner);
    if (isImageSchema(schema)) {
        const alt = def.shape?.['alt'];
        if (alt !== undefined && isObject(value)) collect(alt, value['alt'], [...path, 'alt'], found);
        return;
    }
    if (isText(inner)) {
        if (typeof value === 'string' && value.trim() !== '') {
            found.push({
                path,
                text: value,
                schema: inner,
            });
        }
        return;
    }
    switch (def.type) {
        case 'object':
            if (!isObject(value)) return;
            for (const [key, child] of Object.entries(def.shape ?? {})) collect(child, value[key], [...path, key], found);
            return;
        case 'array':
            if (!Array.isArray(value) || def.element === undefined) return;
            value.forEach((item: unknown, index) => collect(def.element!, item, [...path, index], found));
            return;
        case 'union': {
            const option = def.options?.find((candidate) => z.safeParse(candidate, value).success);
            if (option !== undefined) collect(option, value, path, found);
            return;
        }
        case 'pipe':
            if (def.in !== undefined) collect(def.in, value, path, found);
            return;
        case 'record':
            if (!isObject(value) || def.valueType === undefined) return;
            for (const [key, item] of Object.entries(value)) collect(def.valueType, item, [...path, key], found);
            return;
    }
};

const place = (target: Values, path: Path, text: string): void => {
    let current: Values = target;
    for (const key of path.slice(0, -1)) current = current[key] as Values;
    current[path.at(-1)!] = text;
};

const LETTERS: Readonly<Record<string, string>> = {
    æ: 'ae',
    ø: 'o',
    œ: 'oe',
    ß: 'ss',
    đ: 'd',
    ł: 'l',
};

/**
 * A title as an address segment: `Planter for et mørkt kontor` is
 * `planter-for-et-morkt-kontor`.
 */
export const slugOf = (title: string): string =>
    title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/\p{M}/gu, '')
        .replace(/[æøœßđł]/g, (letter) => LETTERS[letter]!)
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '');

/**
 * The field a slug is made from: `title`, or else the first text field the
 * model translated.
 */
const titleOf = (fields: FieldList, found: readonly Text[]): string | undefined => {
    const names = dataFields(fields).map((field) => field.name);
    if (names.includes('title')) return 'title';
    return found.find((text) => text.path.length === 1)?.path[0] as string | undefined;
};

const languageName = (code: string): string => {
    try {
        const name = new Intl.DisplayNames(['en'], {
            type: 'language',
        }).of(code);
        return name === undefined || name === code ? code : `${name} (${code})`;
    } catch {
        return code;
    }
};

const instructions = (from: string, to: string): string =>
    [
        `Translate every value of the JSON object from ${languageName(from)} to ${languageName(to)}, for a website.`,
        'Answer with the same keys. Keep the tone, and keep names of people, products and places as they are.',
        'Values in a row may be parts of one sentence, split where its formatting changes. Translate them so they read as one sentence in order, and keep the spaces each one starts and ends with.',
    ].join('\n');

/**
 * The fields' values in another language, asked of the model: text, rich
 * text and an image's alt text, each in its place, and a `slug` made from
 * the translated title. Answers only the fields that hold something to
 * translate, and writes nothing.
 *
 * @example
 * const translated = await translateFields({
 *     model,
 *     fields: frontPage.fields,
 *     values: published,
 *     from: 'en',
 *     to: 'nb',
 * });
 */
export const translateFields = async (input: TranslateInput): Promise<Record<string, unknown>> => {
    const found: Text[] = [];
    collectFields(input.fields, input.values, [], found);
    if (found.length === 0) return {};
    const { generateText, NoObjectGeneratedError, Output } = await import('ai');
    const keyed = <Value>(each: (text: Text) => Value): Record<string, Value> =>
        Object.fromEntries(found.map((text, index) => [`t${index}`, each(text)]));
    let answer: Record<string, string>;
    try {
        const result = await generateText({
            model: input.model,
            instructions: instructions(input.from, input.to),
            prompt: JSON.stringify(keyed((text) => text.text)),
            output: Output.object({
                schema: z.object(keyed((text) => text.schema)) as z.ZodType<Record<string, string>>,
            }),
        });
        answer = result.output;
    } catch (error) {
        throw new TranslationError(
            NoObjectGeneratedError.isInstance(error)
                ? `The model's translation from ${input.from} to ${input.to} does not fit the fields.`
                : `The model did not answer: ${error instanceof Error ? error.message : String(error)}`,
            {
                cause: error,
            }
        );
    }
    const translated: Values = structuredClone(
        Object.fromEntries(found.map((text) => [text.path[0]!, input.values[text.path[0] as string]]))
    );
    found.forEach((text, index) => place(translated, text.path, answer[`t${index}`]!));
    const slug = dataFields(input.fields).find((field) => field.name === 'slug' && field.localized !== false);
    const title = titleOf(input.fields, found);
    if (slug !== undefined && title !== undefined && typeof translated[title] === 'string') {
        const derived = slugOf(translated[title]);
        if (derived !== '' && z.safeParse(slug.schema, derived).success) translated['slug'] = derived;
    }
    for (const field of dataFields(input.fields)) {
        if (!(field.name in translated)) continue;
        const parsed = z.safeParse(field.schema, translated[field.name]);
        if (!parsed.success) {
            throw new TranslationError(
                `The model's translation of '${field.name}' to ${input.to} does not fit the field: ${parsed.error.issues[0]?.message}`
            );
        }
    }
    return translated;
};
