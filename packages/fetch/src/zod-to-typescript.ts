import type { z } from 'zod';
import {
    isBinarySchema,
    isFileSchema,
    readDef,
    readDiscriminatedUnion,
    readMetaDescription,
    readMetaId,
    readObjectShape,
    toPascalCase,
    unwrapOptionalWrappers,
} from '@ts-kizuna/core/generator';

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

    all(): NamedType[] {
        return [...this.named.values()].sort((left, right) => left.name.localeCompare(right.name));
    }
}

const quote = (value: string): string => JSON.stringify(value);

const indent = (text: string, depth = 1): string =>
    text
        .split('\n')
        .map((line) => (line.length > 0 ? '    '.repeat(depth) + line : line))
        .join('\n');

/**
 * A property name, quoted only when it is not a plain identifier.
 */
const propertyKey = (key: string): string => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : quote(key));

const objectBody = (schema: z.core.$ZodType, collector: TypeCollector, hint: string): string => {
    const shape = readObjectShape(schema);
    if (!shape) return 'Record<string, unknown>';

    const entries = Object.entries(shape);
    if (entries.length === 0) return 'Record<string, never>';

    const lines = entries.map(([key, field]) => {
        const description = readMetaDescription(field);
        const doc = description ? `/** ${description} */\n` : '';
        const mark = unwrapOptionalWrappers(field).optional ? '?' : '';
        return `${doc}${propertyKey(key)}${mark}: ${typeOf(field, collector, `${hint}${toPascalCase(key)}`)};`;
    });

    return `{\n${indent(lines.join('\n'))}\n}`;
};

/**
 * The TypeScript type a schema describes. Named models are collected and
 * referenced; anonymous shapes are inlined.
 */
export const typeOf = (schema: z.core.$ZodType, collector: TypeCollector, hint: string): string => {
    if (isFileSchema(schema)) return 'File | Blob';
    if (isBinarySchema(schema)) return 'Uint8Array';

    const def = readDef(schema);

    if (def.type === 'nullable' && def.innerType) return `${typeOf(def.innerType, collector, hint)} | null`;
    if (def.type === 'nullish' && def.innerType) return `${typeOf(def.innerType, collector, hint)} | null`;

    if (def.innerType && def.type !== 'object') {
        const { inner } = unwrapOptionalWrappers(schema);
        if (inner !== schema) return typeOf(inner, collector, hint);
        return typeOf(def.innerType, collector, hint);
    }

    if (def.type === 'pipe') {
        const side = def.out ?? def.in;
        return side ? typeOf(side, collector, hint) : 'unknown';
    }

    const modelName = readMetaId(schema);
    if (modelName !== undefined && def.type === 'object') {
        if (collector.claim(modelName)) {
            collector.add({
                name: modelName,
                description: readMetaDescription(schema),
                body: objectBody(schema, collector, modelName),
            });
        }
        return modelName;
    }

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
            return values.length > 0 ? values.map((value) => quote(String(value))).join(' | ') : 'never';
        }
        case 'enum': {
            const values = Object.values(def.entries ?? {});
            return values.length > 0 ? values.map((value) => quote(String(value))).join(' | ') : 'never';
        }
        case 'array':
            return def.element ? `Array<${typeOf(def.element, collector, `${hint}Item`)}>` : 'unknown[]';
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
