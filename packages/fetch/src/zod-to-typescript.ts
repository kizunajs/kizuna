import type { z } from 'zod';
import {
    isBinarySchema,
    isFileSchema,
    readDef,
    readDeprecation,
    readDiscriminatedUnion,
    readMetaBrand,
    readMetaDescription,
    readMetaExamples,
    readMetaId,
    readObjectShape,
    sanitizeIdentifier,
    toPascalCase,
    unwrapOptionalWrappers,
} from 'kizunajs/generator';

/**
 * A named type collected while walking a schema, emitted once and referenced by
 * name wherever it appears.
 */
export interface NamedType {
    name: string;
    description?: string;
    body: string;
}

/**
 * Collects the named types a walk produces, so a model shared by many routes is
 * declared once.
 */
export class TypeCollector {
    private readonly named = new Map<string, NamedType>();
    private readonly claimed = new Set<string>();
    private readonly brands = new Map<
        string,
        {
            brand: string;
            base: string;
            example: string;
        }
    >();

    /**
     * Which side of a pipe a schema is read from: the input a request sends, or
     * the output a response carries.
     */
    private direction: 'input' | 'output' = 'output';

    /**
     * Reads the schemas `read` walks from the side a request sends.
     */
    readingInput<Result>(read: () => Result): Result {
        const previous = this.direction;
        this.direction = 'input';
        try {
            return read();
        } finally {
            this.direction = previous;
        }
    }

    readsInput(): boolean {
        return this.direction === 'input';
    }

    /**
     * Claims a name before its body is walked, so a model that refers to itself
     * resolves to its own name instead of recursing. Answers whether the caller
     * is the one that has to emit it.
     */
    claim(name: string): boolean {
        if (this.claimed.has(name)) return false;
        this.claimed.add(name);
        return true;
    }

    add(type: NamedType): void {
        this.named.set(type.name, type);
    }

    /**
     * Declares a brand as a named type, `UserId = string & KizunaBrand<"UserId">`,
     * and answers the name.
     */
    addBrand(brand: string, base: string, example: string): string {
        const name = sanitizeIdentifier(brand);
        const existing = this.brands.get(name);
        if (existing !== undefined && (existing.brand !== brand || existing.base !== base)) {
            throw new Error(`@kizunajs/fetch: brand ${quote(brand)} wraps both ${existing.base} and ${base}. Give each its own name.`);
        }
        if (existing === undefined) {
            this.brands.set(name, {
                brand,
                base,
                example,
            });
        }
        return name;
    }

    usesBrand(): boolean {
        return this.brands.size > 0;
    }

    /**
     * Each brand's name, the type it wraps, and a value for its `@example`, for
     * the constructors the file exports.
     */
    allBrands(): Array<{
        name: string;
        base: string;
        example: string;
    }> {
        return [...this.brands].map(([name, { base, example }]) => ({
            name,
            base,
            example,
        }));
    }

    all(): NamedType[] {
        for (const name of this.brands.keys()) {
            if (this.named.has(name)) {
                throw new Error(`@kizunajs/fetch: brand ${quote(name)} has the same name as a model. Give each its own name.`);
            }
        }
        const brands = [...this.brands].map(([name, { brand, base }]) => ({
            name,
            description: `A branded \`${base}\`. Responses hand one back, and \`to${name}\` makes one from a plain value.`,
            body: `${base} & KizunaBrand<${quote(brand)}>`,
        }));
        return [...this.named.values(), ...brands].sort((left, right) => left.name.localeCompare(right.name));
    }
}

const quote = (value: string): string => JSON.stringify(value);

/**
 * What a brand wraps: the scalars, as the JSON carries them.
 */
const BRANDABLE_BASES = new Set(['string', 'number', 'boolean']);

/**
 * A literal as the type the JSON carries, so `z.literal(true)` is `true`.
 */
const literalType = (value: unknown): string => {
    if (typeof value === 'string') return quote(value);
    if (typeof value === 'bigint') return `${value}n`;
    if (value === undefined) return 'undefined';
    return String(value);
};

const indent = (text: string, depth = 1): string =>
    text
        .split('\n')
        .map((line) => (line.length > 0 ? '    '.repeat(depth) + line : line))
        .join('\n');

/**
 * A property name, quoted only when it is not a plain identifier.
 */
const propertyKey = (key: string): string => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : quote(key));

/**
 * A doc comment over the lines it is given, or nothing when there are none.
 * Always multi-line, the way the rest of this repository writes them.
 */
export const docComment = (lines: readonly string[]): string => {
    const body = lines.flatMap((line) => line.split('\n'));
    if (body.length === 0) return '';
    return `/**\n${body.map((line) => ` * ${line}`.trimEnd()).join('\n')}\n */\n`;
};

/**
 * Renders a declared example as the TypeScript literal a caller would write.
 */
const exampleLiteral = (value: unknown): string => {
    if (typeof value === 'string') return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
    if (value === undefined) return 'undefined';
    return JSON.stringify(value) ?? 'undefined';
};

const STRING_SAMPLES: Record<string, string> = {
    email: 'ada@example.com',
    url: 'https://example.com',
    uuid: '3f1c2d9e-5b6a-4c7d-8e9f-0a1b2c3d4e5f',
    datetime: '2026-01-01T00:00:00Z',
    date: '2026-01-01',
    time: '00:00:00',
};

const stringSample = (schema: z.core.$ZodType, key: string | undefined): string => {
    const def = readDef(schema);
    const formats = [def.format, ...(def.checks ?? []).map((check) => check.format ?? check.def?.format)];
    for (const format of formats) {
        if (format !== undefined && format in STRING_SAMPLES) return exampleLiteral(STRING_SAMPLES[format]);
    }
    if (key !== undefined && /id$/i.test(key)) return exampleLiteral('1');
    return exampleLiteral('string');
};

/**
 * A value a caller could pass for a schema, used in the `@example` on each
 * client method. A schema that declares an example is taken at its word;
 * anything else gets a value of the right shape.
 */
export const sampleValue = (schema: z.core.$ZodType, depth = 0, key?: string): string => {
    const [declared] = readMetaExamples(schema);
    if (declared !== undefined) return exampleLiteral(declared);

    if (isFileSchema(schema)) return "new File([], 'upload.txt')";
    if (isBinarySchema(schema)) return 'new Uint8Array()';

    const def = readDef(schema);
    if (def.type === 'default' && def.defaultValue !== undefined) return exampleLiteral(def.defaultValue);
    if (def.type === 'pipe') {
        const side = def.in ?? def.out;
        return side ? sampleValue(side, depth, key) : 'undefined';
    }
    if (def.innerType && def.type !== 'object') return sampleValue(def.innerType, depth, key);

    switch (def.type) {
        case 'number':
        case 'int':
            return '1';
        case 'bigint':
            return exampleLiteral('1');
        case 'boolean':
            return 'true';
        case 'date':
            return exampleLiteral('2026-01-01');
        case 'null':
            return 'null';
        case 'literal':
            return def.values?.length ? exampleLiteral(def.values[0]) : 'undefined';
        case 'enum': {
            const [first] = Object.values(def.entries ?? {});
            return first === undefined ? 'undefined' : exampleLiteral(first);
        }
        case 'array': {
            if (!def.element || depth >= SAMPLE_DEPTH) return '[]';
            return `[\n${indent(`${sampleValue(def.element, depth + 1, key)},`)}\n]`;
        }
        case 'tuple':
            return `[${(def.items ?? []).map((item) => sampleValue(item, depth + 1, key)).join(', ')}]`;
        case 'object':
            return sampleObject(schema, depth);
        case 'record':
            return '{}';
        case 'union': {
            const options = readDiscriminatedUnion(schema)?.options ?? def.options ?? [];
            return options[0] ? sampleValue(options[0], depth, key) : 'undefined';
        }
        case 'string':
            return stringSample(schema, key);
        default:
            return 'undefined';
    }
};

const SAMPLE_DEPTH = 2;

/**
 * The required fields of an object schema, written as the literal a caller
 * would pass. Optional fields are left out, since an example shows the least
 * the route needs.
 */
export const sampleObject = (schema: z.core.$ZodType, depth = 0): string => {
    const shape = readObjectShape(schema);
    if (!shape) return '{}';

    const required = Object.entries(shape).filter(([, field]) => !unwrapOptionalWrappers(field).optional);
    if (required.length === 0 || depth >= SAMPLE_DEPTH) return '{}';

    const lines = required.map(
        ([key, field]) => `${propertyKey(key)}: ${sampleValue(unwrapOptionalWrappers(field).inner, depth + 1, key)},`
    );
    return `{\n${indent(lines.join('\n'))}\n}`;
};

/**
 * What an editor shows above a field: its description, whether it is on its way
 * out, and the values the schema declares as examples.
 */
const fieldDoc = (field: z.core.$ZodType): readonly string[] => {
    const lines: string[] = [];
    const description = readMetaDescription(field);
    if (description !== undefined) lines.push(description);

    const deprecation = readDeprecation(field);
    if (deprecation !== undefined) {
        if (lines.length > 0) lines.push('');
        lines.push(`@deprecated ${deprecation.message ?? ''}`.trimEnd());
    }

    for (const example of readMetaExamples(field)) {
        if (lines.length > 0) lines.push('');
        lines.push('@example', exampleLiteral(example));
    }

    return lines;
};

const objectBody = (schema: z.core.$ZodType, collector: TypeCollector, hint: string): string => {
    const shape = readObjectShape(schema);
    if (!shape) return 'Record<string, unknown>';

    const entries = Object.entries(shape);
    if (entries.length === 0) return 'Record<string, never>';

    const lines = entries.map(([key, field]) => {
        const doc = docComment(fieldDoc(field));
        const mark = unwrapOptionalWrappers(field).optional ? '?' : '';
        return `${doc}${propertyKey(key)}${mark}: ${typeOf(field, collector, `${hint}${toPascalCase(key)}`)};`;
    });

    return `{\n${indent(lines.join('\n'))}\n}`;
};

/**
 * The TypeScript type a schema describes. Named models are collected and
 * referenced; anonymous shapes are inlined. A brand is named like a model.
 */
export const typeOf = (schema: z.core.$ZodType, collector: TypeCollector, hint: string): string => {
    const type = unbrandedTypeOf(schema, collector, hint);
    const brand = readMetaBrand(schema);
    if (brand === undefined || !BRANDABLE_BASES.has(type)) return type;
    return collector.addBrand(brand, type, sampleValue(schema, 0, brand));
};

const unbrandedTypeOf = (schema: z.core.$ZodType, collector: TypeCollector, hint: string): string => {
    if (isFileSchema(schema)) return 'File | Blob';
    if (isBinarySchema(schema)) return 'Uint8Array';

    const def = readDef(schema);

    if (def.type === 'nullable' && def.innerType) return `${typeOf(def.innerType, collector, hint)} | null`;
    if (def.type === 'nullish' && def.innerType) return `${typeOf(def.innerType, collector, hint)} | null`;

    if (def.innerType && def.type !== 'object') return typeOf(def.innerType, collector, hint);

    if (def.type === 'pipe') {
        const side = collector.readsInput() ? def.in : (def.out ?? def.in);
        return side ? typeOf(side, collector, hint) : 'unknown';
    }

    const modelName = readMetaId(schema);
    if (modelName !== undefined) {
        if (collector.claim(modelName)) {
            collector.add({
                name: modelName,
                description: readMetaDescription(schema),
                body: structuralType(schema, collector, modelName),
            });
        }
        return modelName;
    }

    return structuralType(schema, collector, hint);
};

/**
 * The type a schema describes by its shape, its name already spent by the caller.
 */
const structuralType = (schema: z.core.$ZodType, collector: TypeCollector, hint: string): string => {
    const def = readDef(schema);

    switch (def.type) {
        case 'string':
            return 'string';
        case 'number':
        case 'int':
            return 'number';
        case 'bigint':
            return 'string';
        case 'boolean':
            return 'boolean';
        case 'date':
            return 'string';
        case 'null':
            return 'null';
        case 'any':
        case 'unknown':
            return 'unknown';
        case 'never':
            return 'never';
        case 'void':
        case 'undefined':
            return 'undefined';
        case 'literal': {
            const values = def.values ?? [];
            return values.length > 0 ? values.map(literalType).join(' | ') : 'never';
        }
        case 'enum': {
            const values = Object.values(def.entries ?? {});
            return values.length > 0 ? values.map(literalType).join(' | ') : 'never';
        }
        case 'array':
            return def.element ? `Array<${typeOf(def.element, collector, `${hint}Item`)}>` : 'unknown[]';
        case 'tuple': {
            const items = (def.items ?? []).map((item, index) => typeOf(item, collector, `${hint}${index}`));
            const rest = def.rest ? [`...Array<${typeOf(def.rest, collector, `${hint}Rest`)}>`] : [];
            return `[${[...items, ...rest].join(', ')}]`;
        }
        case 'object':
            return objectBody(schema, collector, hint);
        case 'record':
            return `Record<string, ${def.valueType ? typeOf(def.valueType, collector, `${hint}Value`) : 'unknown'}>`;
        case 'union': {
            const discriminated = readDiscriminatedUnion(schema);
            const options = discriminated?.options ?? def.options ?? [];
            if (options.length === 0) return 'unknown';
            return options.map((option, index) => typeOf(option, collector, `${hint}${index}`)).join(' | ');
        }
        default:
            return 'unknown';
    }
};
