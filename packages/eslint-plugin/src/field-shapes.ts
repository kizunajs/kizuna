import ts from 'typescript';
import type { SchemaResolver } from './schema-violations.js';

/**
 * The part of a request a schema describes. Each carries its own set of field shapes.
 */
export type RequestPart = 'path' | 'query' | 'header' | 'multipart' | 'urlencoded';

/**
 * A field its part of the request cannot carry.
 */
export type FieldIssue =
    | 'unsendablePath'
    | 'unsendableQuery'
    | 'unsendableHeader'
    | 'unsendableForm'
    | 'binaryFormField'
    | 'fileInUrlencoded';

export interface FieldViolation {
    issue: FieldIssue;
    node: ts.Node;
    viaReference: boolean;
}

type Shape =
    | {
          kind: 'value' | 'file' | 'bytes' | 'structured' | 'unknown';
      }
    | {
          kind: 'list';
          of: Shape;
      };

const STRUCTURED_FACTORIES: ReadonlySet<string> = new Set([
    'object',
    'strictObject',
    'looseObject',
    'record',
    'partialRecord',
    'tuple',
    'map',
    'set',
]);

const WRAPPER_FACTORIES: ReadonlySet<string> = new Set(['optional', 'nullable', 'nullish', 'readonly']);

const OPAQUE_FACTORIES: ReadonlySet<string> = new Set([
    'union',
    'discriminatedUnion',
    'intersection',
    'lazy',
    'pipe',
    'custom',
    'any',
    'unknown',
]);

const OBJECT_FACTORIES: ReadonlySet<string> = new Set(['object', 'strictObject', 'looseObject']);

const unknown: Shape = {
    kind: 'unknown',
};

/**
 * Whether an expression is `z` or a namespace under it, like `z.iso`.
 */
const isZodNamespace = (node: ts.Expression): boolean => {
    if (ts.isIdentifier(node)) return node.text === 'z';
    return ts.isPropertyAccessExpression(node) && isZodNamespace(node.expression);
};

const classify = (node: ts.Node, resolve: SchemaResolver, depth = 0): Shape => {
    if (depth > 8) return unknown;
    if (ts.isIdentifier(node)) {
        if (node.text === 'FileSchema') {
            return {
                kind: 'file',
            };
        }
        if (node.text === 'BinarySchema') {
            return {
                kind: 'bytes',
            };
        }
        const target = resolve(node);
        return target ? classify(target, resolve, depth + 1) : unknown;
    }
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return unknown;
    const callee = node.expression;
    const name = callee.name.text;
    const [argument] = node.arguments;

    if (isZodNamespace(callee.expression)) {
        if (STRUCTURED_FACTORIES.has(name)) {
            return {
                kind: 'structured',
            };
        }
        if (name === 'array') {
            return {
                kind: 'list',
                of: argument ? classify(argument, resolve, depth + 1) : unknown,
            };
        }
        if (name === 'instanceof') {
            if (argument && ts.isIdentifier(argument) && argument.text === 'File') {
                return {
                    kind: 'file',
                };
            }
            if (argument && ts.isIdentifier(argument) && (argument.text === 'Uint8Array' || argument.text === 'Buffer')) {
                return {
                    kind: 'bytes',
                };
            }
            return unknown;
        }
        if (WRAPPER_FACTORIES.has(name)) return argument ? classify(argument, resolve, depth + 1) : unknown;
        if (OPAQUE_FACTORIES.has(name)) return unknown;
        return {
            kind: 'value',
        };
    }

    if (ts.isIdentifier(callee.expression) && callee.expression.text === 'Kizuna' && name === 'model') {
        const schema = schemaOfModel(node);
        return schema ? classify(schema, resolve, depth + 1) : unknown;
    }
    if (name === 'array') {
        return {
            kind: 'list',
            of: classify(callee.expression, resolve, depth + 1),
        };
    }
    if (name === 'extend') {
        return {
            kind: 'structured',
        };
    }
    if (name === 'or' || name === 'and') return unknown;
    return classify(callee.expression, resolve, depth + 1);
};

const schemaOfModel = (call: ts.CallExpression): ts.Expression | undefined => {
    const [declaration] = call.arguments;
    if (!declaration || !ts.isObjectLiteralExpression(declaration)) return undefined;
    for (const property of declaration.properties) {
        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === 'schema')
            return property.initializer;
    }
    return undefined;
};

interface Field {
    node: ts.Expression;
    viaReference: boolean;
}

/**
 * The fields of an object schema, following named schemas, `Kizuna.model` and `.extend()`.
 */
const fieldsOf = (node: ts.Node, resolve: SchemaResolver, viaReference = false, depth = 0): Field[] => {
    if (depth > 8) return [];
    if (ts.isIdentifier(node)) {
        const target = resolve(node);
        return target ? fieldsOf(target, resolve, true, depth + 1) : [];
    }
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return [];
    const callee = node.expression;
    const name = callee.name.text;
    const [argument] = node.arguments;
    if (isZodNamespace(callee.expression) && OBJECT_FACTORIES.has(name)) {
        return argument ? shapeFields(argument, viaReference) : [];
    }
    if (ts.isIdentifier(callee.expression) && callee.expression.text === 'Kizuna' && name === 'model') {
        const schema = schemaOfModel(node);
        return schema ? fieldsOf(schema, resolve, viaReference, depth + 1) : [];
    }
    if (name === 'extend') {
        return [...fieldsOf(callee.expression, resolve, viaReference, depth + 1), ...(argument ? shapeFields(argument, viaReference) : [])];
    }
    return fieldsOf(callee.expression, resolve, viaReference, depth + 1);
};

const shapeFields = (shape: ts.Expression, viaReference: boolean): Field[] => {
    if (!ts.isObjectLiteralExpression(shape)) return [];
    return shape.properties.filter(ts.isPropertyAssignment).map((property) => ({
        node: property.initializer,
        viaReference,
    }));
};

const isValueOrUnknown = (shape: Shape): boolean => shape.kind === 'value' || shape.kind === 'unknown';

const issueFor = (part: RequestPart, shape: Shape): FieldIssue | undefined => {
    if (shape.kind === 'unknown') return undefined;
    const element = shape.kind === 'list' ? shape.of : undefined;
    switch (part) {
        case 'path':
            return shape.kind === 'value' ? undefined : 'unsendablePath';
        case 'header':
            return shape.kind === 'value' ? undefined : 'unsendableHeader';
        case 'query':
            return isValueOrUnknown(element ?? shape) ? undefined : 'unsendableQuery';
        case 'multipart':
        case 'urlencoded': {
            const carried = element ?? shape;
            if (carried.kind === 'bytes') return 'binaryFormField';
            if (carried.kind === 'file') return part === 'multipart' ? undefined : 'fileInUrlencoded';
            return isValueOrUnknown(carried) ? undefined : 'unsendableForm';
        }
    }
};

/**
 * Every field of a request schema its part of the request cannot carry. A field whose shape the source does not show
 * is left alone.
 */
export const collectUnsendableFields = (root: ts.Node, resolve: SchemaResolver, part: RequestPart): FieldViolation[] => {
    const violations: FieldViolation[] = [];
    for (const field of fieldsOf(root, resolve)) {
        const issue = issueFor(part, classify(field.node, resolve));
        if (issue === undefined) continue;
        violations.push({
            issue,
            node: field.node,
            viaReference: field.viaReference,
        });
    }
    return violations;
};
