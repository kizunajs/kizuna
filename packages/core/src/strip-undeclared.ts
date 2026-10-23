import type { z } from 'zod';

interface StripDef {
    type?: string;
    shape?: Record<string, z.core.$ZodType>;
    catchall?: z.core.$ZodType;
    element?: z.core.$ZodType;
    items?: z.core.$ZodType[];
    rest?: z.core.$ZodType | null;
    keyType?: z.core.$ZodType;
    valueType?: z.core.$ZodType;
    options?: z.core.$ZodType[];
    discriminator?: string;
    left?: z.core.$ZodType;
    right?: z.core.$ZodType;
    innerType?: z.core.$ZodType;
    in?: z.core.$ZodType;
    entries?: Record<string, unknown>;
    values?: unknown[];
}

/**
 * Where a value's schema comes from: a Zod schema, the schemas an intersection
 * lays over one value, or a shape already worked out.
 */
type Source = object;

/**
 * What a schema says about the keys of the one value in front of it.
 */
type Concrete =
    | {
          kind: 'whole';
      }
    | {
          kind: 'scalar';
          /**
           * The values a literal or an enum allows, which rule a union option out.
           */
          values?: ReadonlySet<unknown>;
      }
    | {
          kind: 'object';
          fields: ReadonlyMap<string, Source>;
          rest: Source | undefined;
      }
    | {
          kind: 'array';
          element: Source;
      }
    | {
          kind: 'tuple';
          items: readonly Source[];
          rest: Source | undefined;
      }
    | {
          kind: 'record';
          keys: ReadonlySet<string> | undefined;
          value: Source;
      };

/**
 * A schema read once. A union or an intersection only becomes concrete once
 * the value it describes is known.
 */
type Shape =
    | Concrete
    | {
          kind: 'union';
          options: readonly Source[];
          discriminator: string | undefined;
      }
    | {
          kind: 'all';
          parts: readonly Source[];
      };

type UnionShape = Extract<Shape, { kind: 'union' }>;

type JsonKind = 'object' | 'array' | 'scalar' | 'absent';

/**
 * Schema kinds that hold one value and declare no keys.
 */
const SCALAR_TYPES: ReadonlySet<string> = new Set([
    'string',
    'number',
    'boolean',
    'bigint',
    'symbol',
    'template_literal',
    'null',
    'undefined',
    'void',
    'nan',
    'date',
    'never',
]);

/**
 * Schema kinds that only pass their inner schema on.
 */
const WRAPPER_TYPES: ReadonlySet<string> = new Set([
    'optional',
    'nullable',
    'default',
    'prefault',
    'catch',
    'nonoptional',
    'readonly',
    'success',
]);

const WHOLE: Concrete = {
    kind: 'whole',
};

const SCALAR: Concrete = {
    kind: 'scalar',
};

const NO_FIELDS: Concrete = {
    kind: 'object',
    fields: new Map(),
    rest: undefined,
};

const NO_ITEMS: Concrete = {
    kind: 'tuple',
    items: [],
    rest: undefined,
};

const shapes = new WeakMap<object, Shape>();

const definitionOf = (schema: z.core.$ZodType): StripDef => schema._zod.def as StripDef;

/**
 * The values a literal or an enum schema allows, or `undefined` for any other.
 */
const allowedValues = (schema: z.core.$ZodType | undefined): ReadonlySet<unknown> | undefined => {
    if (schema === undefined) return undefined;
    const definition = definitionOf(schema);
    if (definition.type === 'enum' && definition.entries) return new Set(Object.values(definition.entries));
    if (definition.type === 'literal' && definition.values) return new Set(definition.values);
    return undefined;
};

const shapeOfSchema = (schema: z.core.$ZodType): Shape => {
    const definition = definitionOf(schema);
    const type = definition.type ?? '';
    if (WRAPPER_TYPES.has(type)) return definition.innerType ? shapeOf(definition.innerType) : WHOLE;
    if (SCALAR_TYPES.has(type)) return SCALAR;
    switch (type) {
        case 'literal':
        case 'enum':
            return {
                kind: 'scalar',
                values: allowedValues(schema),
            };
        case 'object': {
            const catchall = definition.catchall;
            return {
                kind: 'object',
                fields: new Map(Object.entries(definition.shape ?? {})),
                rest: catchall === undefined || definitionOf(catchall).type === 'never' ? undefined : catchall,
            };
        }
        case 'array':
            return definition.element
                ? {
                      kind: 'array',
                      element: definition.element,
                  }
                : WHOLE;
        case 'tuple':
            return {
                kind: 'tuple',
                items: definition.items ?? [],
                rest: definition.rest ?? undefined,
            };
        case 'record': {
            if (!definition.valueType) return WHOLE;
            const keys = allowedValues(definition.keyType);
            return {
                kind: 'record',
                keys: keys === undefined ? undefined : new Set([...keys].map(String)),
                value: definition.valueType,
            };
        }
        case 'union':
            return {
                kind: 'union',
                options: definition.options ?? [],
                discriminator: definition.discriminator,
            };
        case 'intersection':
            return definition.left && definition.right
                ? {
                      kind: 'all',
                      parts: [definition.left, definition.right],
                  }
                : WHOLE;
        case 'pipe':
            // The wire carries what the handler returned, the input side.
            return definition.in ? shapeOf(definition.in) : WHOLE;
        case 'lazy': {
            // Zod builds the inner schema once and keeps it here.
            const inner = (schema._zod as { innerType?: z.core.$ZodType }).innerType;
            return inner ? shapeOf(inner) : WHOLE;
        }
        default:
            // `z.any`, `z.unknown`, `z.custom`, `z.instanceof`, a bare transform: nothing said about keys.
            return WHOLE;
    }
};

const shapeOf = (source: Source): Shape => {
    const cached = shapes.get(source);
    if (cached !== undefined) return cached;
    if (!Array.isArray(source) && !('_zod' in source)) return source as Shape;
    const shape: Shape = Array.isArray(source)
        ? {
              kind: 'all',
              parts: source,
          }
        : shapeOfSchema(source as z.core.$ZodType);
    shapes.set(source, shape);
    return shape;
};

const kinds = new WeakMap<Shape, ReadonlySet<JsonKind | 'any'>>();

/**
 * The JSON kinds a shape can describe, worked out once per shape.
 */
const kindsOf = (shape: Shape): ReadonlySet<JsonKind | 'any'> => {
    const cached = kinds.get(shape);
    if (cached !== undefined) return cached;
    const collected = new Set<JsonKind | 'any'>();
    // A shape met again inside itself adds nothing.
    kinds.set(shape, collected);
    switch (shape.kind) {
        case 'whole':
            collected.add('any');
            break;
        case 'scalar':
            collected.add('scalar');
            break;
        case 'object':
        case 'record':
            collected.add('object');
            break;
        case 'array':
        case 'tuple':
            collected.add('array');
            break;
        case 'union':
        case 'all':
            for (const source of shape.kind === 'union' ? shape.options : shape.parts) {
                for (const kind of kindsOf(shapeOf(source))) collected.add(kind);
            }
            break;
    }
    return collected;
};

const fits = (source: Source, kind: JsonKind): boolean => {
    if (kind === 'absent') return true;
    const described = kindsOf(shapeOf(source));
    return described.has('any') || described.has(kind);
};

/**
 * The value as `JSON.stringify` sees it under `key`: `toJSON` applied, and a
 * boxed primitive unboxed.
 */
const asJson = (value: unknown, key: string): unknown => {
    let seen = value;
    if ((typeof seen === 'object' && seen !== null) || typeof seen === 'bigint') {
        const toJSON = (seen as { toJSON?: unknown }).toJSON;
        if (typeof toJSON === 'function') seen = toJSON.call(seen, key);
    }
    if (seen instanceof Number) return Number(seen);
    if (seen instanceof String) return String(seen);
    if (seen instanceof Boolean || seen instanceof BigInt) return seen.valueOf();
    return seen;
};

const kindOf = (value: unknown): JsonKind => {
    if (value === undefined) return 'absent';
    if (Array.isArray(value)) return 'array';
    return typeof value === 'object' && value !== null ? 'object' : 'scalar';
};

const isObject = (value: unknown): value is Record<string, unknown> => kindOf(value) === 'object';

/**
 * The children of one value as JSON sees them, read once, so a `toJSON` runs
 * once however many union options look at the value.
 */
class ValueView {
    #children: Map<string, unknown> | undefined;
    readonly #views = new Map<string, ValueView>();

    constructor(readonly value: unknown) {}

    /**
     * Every child in order. An array hole is a child too, holding `undefined`,
     * which JSON writes as `null`.
     */
    get children(): ReadonlyMap<string, unknown> {
        if (this.#children !== undefined) return this.#children;
        const source = this.value;
        const children = new Map<string, unknown>();
        if (Array.isArray(source)) {
            for (let index = 0; index < source.length; index += 1) {
                const key = String(index);
                children.set(key, index in source ? asJson(source[index], key) : undefined);
            }
        } else if (isObject(source)) {
            for (const key of Object.keys(source)) children.set(key, asJson(source[key], key));
        }
        this.#children = children;
        return children;
    }

    /**
     * The view of one child, made once however many options look at it.
     */
    child(key: string): ValueView {
        let view = this.#views.get(key);
        if (view === undefined) {
            view = new ValueView(this.children.get(key));
            this.#views.set(key, view);
        }
        return view;
    }
}

/**
 * The schema a concrete shape gives one key of an object, or `undefined` when
 * it declares none.
 */
const declaredFor = (shape: Concrete, key: string): Source | undefined => {
    if (shape.kind === 'object') return shape.fields.get(key) ?? shape.rest;
    if (shape.kind === 'record') return shape.keys === undefined || shape.keys.has(key) ? shape.value : undefined;
    if (shape.kind === 'whole') return WHOLE;
    return undefined;
};

interface Score {
    covered: number;
    fitting: number;
}

const better = (score: Score, than: Score): number => score.covered - than.covered || score.fitting - than.fitting;

/**
 * How well a concrete option describes an object: how many of its keys it
 * declares, and how many of those it declares with the JSON kind the value
 * holds. `undefined` rules the option out, for a literal or enum field the
 * value disagrees with, or for a value of the wrong kind.
 */
const scoreObject = (shape: Concrete, view: ValueView): Score | undefined => {
    if (shape.kind === 'whole') {
        return {
            covered: view.children.size,
            fitting: view.children.size,
        };
    }
    if (shape.kind !== 'object' && shape.kind !== 'record') return undefined;
    const score: Score = {
        covered: 0,
        fitting: 0,
    };
    for (const [key, child] of view.children) {
        const declared = declaredFor(shape, key);
        if (declared === undefined) continue;
        const allowed = shapeOf(declared);
        if (
            allowed.kind === 'scalar' &&
            allowed.values !== undefined &&
            child !== null &&
            child !== undefined &&
            !allowed.values.has(child)
        ) {
            return undefined;
        }
        score.covered += 1;
        if (fits(declared, kindOf(child))) score.fitting += 1;
    }
    return score;
};

/**
 * How well a concrete option describes an array, summed over its items, so
 * one option is picked for the whole array.
 */
const scoreArray = (shape: Concrete, view: ValueView): Score | undefined => {
    if (shape.kind === 'whole') {
        return {
            covered: Number.MAX_SAFE_INTEGER,
            fitting: Number.MAX_SAFE_INTEGER,
        };
    }
    if (shape.kind !== 'array' && shape.kind !== 'tuple') return undefined;
    const score: Score = {
        covered: 0,
        fitting: 0,
    };
    for (const [key, item] of view.children) {
        if (item === null || item === undefined) continue;
        const element = shape.kind === 'array' ? shape.element : (shape.items[Number(key)] ?? shape.rest);
        if (element === undefined || !fits(element, kindOf(item))) continue;
        score.fitting += 1;
        if (!isObject(item)) continue;
        const itemView = view.child(key);
        const inner = scoreObject(resolve(shapeOf(element), itemView, new Map()), itemView);
        if (inner === undefined) continue;
        score.covered += inner.covered;
        score.fitting += inner.fitting;
    }
    return score;
};

const unmatchedShapes = new WeakMap<UnionShape, Concrete>();

/**
 * A union none of whose options fits the value, such as a discriminator that
 * names no option: the keys some option declares stay, a value is followed into
 * only when exactly one option declares its key, and anything else keeps its
 * scalar and loses its keys.
 */
const unmatchedShape = (union: UnionShape): Concrete => {
    const cached = unmatchedShapes.get(union);
    if (cached !== undefined) return cached;
    const declaring = new Map<string, Source[]>();
    for (const option of union.options) {
        const shape = shapeOf(option);
        if (shape.kind !== 'object') continue;
        for (const [key, field] of shape.fields) declaring.set(key, [...(declaring.get(key) ?? []), field]);
    }
    const fields = new Map<string, Source>();
    for (const [key, declared] of declaring) fields.set(key, declared.length === 1 && key !== union.discriminator ? declared[0]! : SCALAR);
    const shape: Concrete = {
        kind: 'object',
        fields,
        rest: undefined,
    };
    unmatchedShapes.set(union, shape);
    return shape;
};

const discriminatorValues = (option: Source, discriminator: string): ReadonlySet<unknown> | undefined => {
    if (!('_zod' in option)) return undefined;
    const propValues = ((option as z.core.$ZodType)._zod as { propValues?: Record<string, ReadonlySet<unknown>> }).propValues;
    return propValues?.[discriminator];
};

interface ScoredOption {
    shape: Concrete;
    score: Score;
}

interface UnionIndex {
    /**
     * Per option, its object shape when it is a plain object without a
     * catch-all, which the index below scores.
     */
    objects: ReadonlyArray<Extract<Concrete, { kind: 'object' }> | undefined>;
    /**
     * For each key, the options whose object shape declares it.
     */
    declaring: ReadonlyMap<string, readonly number[]>;
    /**
     * The options scored one by one: unions, intersections, records, objects
     * with a catch-all, and anything taking any value.
     */
    others: readonly number[];
}

const unionIndexes = new WeakMap<UnionShape, UnionIndex>();

/**
 * Which plain-object options declare each key, worked out once per union, so
 * scoring an object costs its keys rather than every option times its keys.
 */
const unionIndex = (union: UnionShape): UnionIndex => {
    const cached = unionIndexes.get(union);
    if (cached !== undefined) return cached;
    const objects = union.options.map((option) => {
        const shape = shapeOf(option);
        return shape.kind === 'object' && shape.rest === undefined ? shape : undefined;
    });
    const declaring = new Map<string, number[]>();
    objects.forEach((shape, position) => {
        for (const key of shape?.fields.keys() ?? []) declaring.set(key, [...(declaring.get(key) ?? []), position]);
    });
    const index = {
        objects,
        declaring,
        others: objects.flatMap((shape, position) => (shape === undefined ? [position] : [])),
    };
    unionIndexes.set(union, index);
    return index;
};

/**
 * Every option that can describe an object, in order, with its score. A plain
 * object option declaring none of the value's keys is left out, since it adds
 * nothing an option that does would not.
 */
const scoreObjectOptions = (union: UnionShape, view: ValueView, memo: Map<Shape, Concrete>): ScoredOption[] => {
    const { objects, declaring, others } = unionIndex(union);
    const counted = new Map<number, Score>();
    const ruledOut = new Set<number>();
    for (const [key, child] of view.children) {
        for (const position of declaring.get(key) ?? []) {
            if (ruledOut.has(position)) continue;
            const declared = objects[position]!.fields.get(key)!;
            const allowed = shapeOf(declared);
            if (
                allowed.kind === 'scalar' &&
                allowed.values !== undefined &&
                child !== null &&
                child !== undefined &&
                !allowed.values.has(child)
            ) {
                ruledOut.add(position);
                continue;
            }
            let score = counted.get(position);
            if (score === undefined) {
                score = {
                    covered: 0,
                    fitting: 0,
                };
                counted.set(position, score);
            }
            score.covered += 1;
            if (fits(declared, kindOf(child))) score.fitting += 1;
        }
    }
    const scored: Array<ScoredOption & { position: number }> = [];
    for (const [position, score] of counted) {
        if (ruledOut.has(position)) continue;
        scored.push({
            position,
            shape: objects[position]!,
            score,
        });
    }
    for (const position of others) {
        const resolved = resolve(shapeOf(union.options[position]!), view, memo);
        const score = scoreObject(resolved, view);
        if (score !== undefined) {
            scored.push({
                position,
                shape: resolved,
                score,
            });
        }
    }
    return scored.sort((left, right) => left.position - right.position);
};

/**
 * Every option that can describe an array, in order, with its score.
 */
const scoreArrayOptions = (union: UnionShape, view: ValueView, memo: Map<Shape, Concrete>): ScoredOption[] =>
    union.options.flatMap((option) => {
        const resolved = resolve(shapeOf(option), view, memo);
        const score = scoreArray(resolved, view);
        return score === undefined
            ? []
            : [
                  {
                      shape: resolved,
                      score,
                  },
              ];
    });

/**
 * The one option a union strips the value by. A discriminated union takes the
 * option its discriminator names. Any other union rules out the options of the
 * wrong kind, or with a literal field the value disagrees with, and takes the
 * one declaring the most of the value with the right kinds, the first on a tie.
 */
const resolveUnion = (union: UnionShape, view: ValueView, memo: Map<Shape, Concrete>): Concrete => {
    const kind = kindOf(view.value);
    if (kind !== 'object' && kind !== 'array') return SCALAR;
    if (union.discriminator !== undefined && kind === 'object') {
        const named = view.children.get(union.discriminator);
        const option = union.options.find((candidate) => discriminatorValues(candidate, union.discriminator!)?.has(named));
        return option === undefined ? unmatchedShape(union) : resolve(shapeOf(option), view, memo);
    }
    const scores = kind === 'object' ? scoreObjectOptions(union, view, memo) : scoreArrayOptions(union, view, memo);
    let best: Score | undefined;
    let tied: Concrete[] = [];
    for (const { shape, score } of scores) {
        const comparison = best === undefined ? 1 : better(score, best);
        if (comparison > 0) {
            best = score;
            tied = [shape];
        } else if (comparison === 0) {
            tied.push(shape);
        }
    }
    // On a tie, the first in the union's own order, so the body always matches one option.
    return tied[0] ?? (kind === 'object' ? unmatchedShape(union) : NO_ITEMS);
};

/**
 * The parts of an intersection, each made concrete for the value, laid over
 * one another. Object fields and record values join, and a key several parts
 * declare is stripped by all of them at once.
 */
const resolveAll = (parts: readonly Source[], view: ValueView, memo: Map<Shape, Concrete>): Concrete => {
    const resolved = parts.map((part) => resolve(shapeOf(part), view, memo));
    if (resolved.some((part) => part.kind === 'whole')) return WHOLE;
    const kind = kindOf(view.value);
    const joined = (sources: readonly Source[]): Source | undefined => (sources.length > 1 ? sources : sources[0]);
    if (kind === 'object') {
        const fields = new Map<string, Source[]>();
        const rests: Source[] = [];
        let keyed = false;
        for (const part of resolved) {
            if (part.kind === 'object') {
                keyed = true;
                for (const [key, field] of part.fields) fields.set(key, [...(fields.get(key) ?? []), field]);
                if (part.rest !== undefined) rests.push(part.rest);
            } else if (part.kind === 'record') {
                keyed = true;
                if (part.keys === undefined) rests.push(part.value);
                else for (const key of part.keys) fields.set(key, [...(fields.get(key) ?? []), part.value]);
            }
        }
        if (!keyed) return NO_FIELDS;
        return {
            kind: 'object',
            fields: new Map([...fields].map(([key, sources]) => [key, joined(sources)!])),
            rest: joined(rests),
        };
    }
    if (kind === 'array') {
        const elements = resolved.flatMap((part) => (part.kind === 'array' ? [part.element] : []));
        if (elements.length > 0) {
            return {
                kind: 'array',
                element: joined(elements)!,
            };
        }
        return resolved.find((part) => part.kind === 'tuple') ?? NO_ITEMS;
    }
    return SCALAR;
};

/**
 * A shape made concrete for one value. `memo` holds what this value already
 * resolved, so a union reached twice, or through itself, costs once.
 */
const resolve = (shape: Shape, view: ValueView, memo: Map<Shape, Concrete>): Concrete => {
    if (shape.kind !== 'union' && shape.kind !== 'all') return shape;
    const known = memo.get(shape);
    if (known !== undefined) return known;
    // Reached again inside itself, it declares nothing more.
    memo.set(shape, SCALAR);
    const concrete = shape.kind === 'union' ? resolveUnion(shape, view, memo) : resolveAll(shape.parts, view, memo);
    memo.set(shape, concrete);
    return concrete;
};

/**
 * Sets a key as an own property, so a key named `__proto__` stays a key.
 */
const assign = (target: Record<string, unknown>, key: string, value: unknown): void => {
    Object.defineProperty(target, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
    });
};

/**
 * What is left of a value where nothing declares its keys. A scalar goes out
 * as the handler returned it, so a `Date` stays a `Date` for anything that
 * reads the body before JSON does.
 */
const withoutKeys = (value: unknown, raw: unknown): unknown => {
    const kind = kindOf(value);
    if (kind === 'array') return [];
    return kind === 'object' ? {} : raw;
};

/**
 * Strip one value already as JSON sees it. `raw` is what the handler returned,
 * sent untouched where the schema says nothing about keys.
 */
const stripValue = (shape: Shape, view: ValueView, raw: unknown): unknown => {
    const value = view.value;
    const concrete = resolve(shape, view, new Map());
    switch (concrete.kind) {
        case 'whole':
            return raw;
        case 'scalar':
            return withoutKeys(value, raw);
        case 'object':
        case 'record': {
            if (!isObject(value)) return withoutKeys(value, raw);
            const kept: Record<string, unknown> = {};
            for (const [key, child] of view.children) {
                const declared = declaredFor(concrete, key);
                if (declared !== undefined)
                    assign(kept, key, stripChild(declared, view.child(key), (value as Record<string, unknown>)[key]));
            }
            return kept;
        }
        case 'array':
        case 'tuple': {
            if (!Array.isArray(value)) return withoutKeys(value, raw);
            const length =
                concrete.kind === 'tuple' && concrete.rest === undefined ? Math.min(value.length, concrete.items.length) : value.length;
            const kept: unknown[] = [];
            for (let index = 0; index < length; index += 1) {
                if (!(index in value)) {
                    kept.push(null);
                    continue;
                }
                const element = concrete.kind === 'array' ? concrete.element : (concrete.items[index] ?? concrete.rest!);
                kept.push(stripChild(element, view.child(String(index)), value[index]));
            }
            return kept;
        }
    }
};

const stripChild = (source: Source, view: ValueView, raw: unknown): unknown => {
    const shape = shapeOf(source);
    return shape.kind === 'whole' ? raw : stripValue(shape, view, raw);
};

/**
 * The value as `JSON.stringify` would send it, without the keys its schema does
 * not declare, at every depth the schema describes. Nothing else changes: no
 * default is filled, no transform runs, and the keys left keep their order.
 * Only own enumerable keys count, and `toJSON` applies, as they do for JSON.
 *
 * `z.looseObject`, `.catchall()` and `z.record` declare the keys they let
 * through, and `z.strictObject` declares none beyond its shape. `z.any`,
 * `z.unknown`, `z.custom`, `z.instanceof` and `z.preprocess` say nothing about
 * keys, so a value under one goes out whole. A plain object or array where the
 * schema declares a scalar keeps none of its keys.
 *
 * It never validates, and strips each part of the value by one schema. A
 * discriminated union takes the option its discriminator names. Any other union
 * reads the value's shape: options of the wrong kind or with a disagreeing
 * literal are ruled out, and the one declaring the most of the value with the
 * right kinds wins, the first on a tie. An intersection lays its parts, each resolved the same
 * way, over one another. It throws when the value is too deep to walk or a
 * `toJSON` throws, and the body is then never sent.
 */
export const stripUndeclared = (schema: z.core.$ZodType, value: unknown): unknown =>
    stripChild(schema, new ValueView(asJson(value, '')), value);
